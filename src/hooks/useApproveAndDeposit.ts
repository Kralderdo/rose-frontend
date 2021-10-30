import { POOLS_MAP, PoolName, TRANSACTION_TYPES, Token } from "../constants"
import { notifyCustomError, notifyHandler } from "../utils/notifyHandler"
import {
  useAllContracts,
  useLPTokenContract,
  usePoolContract,
} from "./useContract"
import { useDispatch, useSelector } from "react-redux"

import { AppState } from "../state"
import { BigNumber } from "@ethersproject/bignumber"
import { Erc20 } from "../../types/ethers-contracts/Erc20"
import { GasPrices } from "../state/user"
import { IS_PRODUCTION } from "../utils/environment"
import META_SWAP_ABI from "../constants/abis/metaSwap.json"
import { MetaSwap } from "../../types/ethers-contracts/MetaSwap"
import { NumberInputState } from "../utils/numberInputState"
import { RoseStablesPool } from "../../types/ethers-contracts/RoseStablesPool"
import checkAndApproveTokenForTrade from "../utils/checkAndApproveTokenForTrade"
import { getContract } from "../utils"
import { parseUnits } from "@ethersproject/units"
import { subtractSlippage } from "../utils/slippage"
import { updateLastTransactionTimes } from "../state/application"
import { useActiveWeb3React } from "."
import { useMemo } from "react"

interface ApproveAndDepositStateArgument {
  [tokenSymbol: string]: NumberInputState
}

export function useApproveAndDeposit(
  poolName: PoolName,
): (
  state: ApproveAndDepositStateArgument,
  shouldDepositWrapped?: boolean,
) => Promise<void> {
  const dispatch = useDispatch()
  // const swapContract = useSwapContract(poolName)
  const poolContract = usePoolContract(poolName)
  const lpTokenContract = useLPTokenContract(poolName)
  const tokenContracts = useAllContracts()
  const { account, chainId, library } = useActiveWeb3React()
  const { gasStandard, gasFast, gasInstant } = useSelector(
    (state: AppState) => state.application,
  )
  const {
    slippageCustom,
    slippageSelected,
    gasPriceSelected,
    gasCustom,
    infiniteApproval,
  } = useSelector((state: AppState) => state.user)
  const POOL = POOLS_MAP[poolName]
  const metaSwapContract = useMemo(() => {
    if (POOL.metaSwapAddresses && chainId && library) {
      return getContract(
        POOL.metaSwapAddresses?.[chainId],
        META_SWAP_ABI,
        library,
        account ?? undefined,
      ) as MetaSwap
    }
    return null
  }, [chainId, library, POOL.metaSwapAddresses, account])

  return async function approveAndDeposit(
    state: ApproveAndDepositStateArgument,
    shouldDepositWrapped = false,
  ): Promise<void> {
    try {
      if (!account) throw new Error("Wallet must be connected")
      if (
        !poolContract ||
        !lpTokenContract ||
        (shouldDepositWrapped && !metaSwapContract)
      )
        throw new Error("Swap contract is not loaded")

      const poolTokens = shouldDepositWrapped
        ? (POOL.underlyingPoolTokens as Token[])
        : POOL.poolTokens
      const effectiveSwapContract = shouldDepositWrapped
        ? (metaSwapContract as MetaSwap)
        : poolContract

      let gasPriceUnsafe: string | number | undefined
      if (gasPriceSelected === GasPrices.Custom) {
        gasPriceUnsafe = gasCustom?.valueSafe
      } else if (gasPriceSelected === GasPrices.Fast) {
        gasPriceUnsafe = gasFast
      } else if (gasPriceSelected === GasPrices.Instant) {
        gasPriceUnsafe = gasInstant
      } else {
        gasPriceUnsafe = gasStandard
      }
      const gasPrice = parseUnits(String(gasPriceUnsafe) || "45", 9)
      const approveSingleToken = async (token: Token): Promise<void> => {
        const spendingValue = BigNumber.from(state[token.symbol].valueSafe)
        if (spendingValue.isZero()) return
        const tokenContract = tokenContracts?.[token.symbol] as Erc20
        if (tokenContract == null) return
        await checkAndApproveTokenForTrade(
          tokenContract,
          effectiveSwapContract.address,
          account,
          spendingValue,
          infiniteApproval,
          gasPrice,
          {
            onTransactionError: (error) => {
              console.error(error)
              throw new Error("Your transaction could not be completed")
            },
          },
        )
        return
      }
      // For each token being deposited, check the allowance and approve it if necessary
      if (!IS_PRODUCTION) {
        for (const token of poolTokens) {
          await approveSingleToken(token)
        }
      } else {
        await Promise.all(poolTokens.map((token) => approveSingleToken(token)))
      }

      const effectivePoolContract = effectiveSwapContract as RoseStablesPool
      const txnAmounts: [BigNumber, BigNumber, BigNumber] = [
        BigNumber.from(state[poolTokens[0].symbol].valueSafe),
        BigNumber.from(state[poolTokens[1].symbol].valueSafe),
        BigNumber.from(state[poolTokens[2].symbol].valueSafe),
      ]

      const isFirstTransaction = (await lpTokenContract.totalSupply()).isZero()
      let minToMint: BigNumber
      if (isFirstTransaction) {
        minToMint = BigNumber.from("0")
      } else {
        minToMint = await effectivePoolContract.calc_token_amount(
          txnAmounts,
          true, // deposit boolean
        )
      }

      minToMint = subtractSlippage(minToMint, slippageSelected, slippageCustom)

      // const swapFlashLoanContract = effectiveSwapContract as RoseStablesPool
      const spendTransaction = await effectivePoolContract?.add_liquidity(
        txnAmounts,
        minToMint,
        {
          gasPrice,
        },
      )

      notifyHandler(spendTransaction.hash, "deposit")

      await spendTransaction.wait()
      dispatch(
        updateLastTransactionTimes({
          [TRANSACTION_TYPES.DEPOSIT]: Date.now(),
        }),
      )
      return Promise.resolve()
    } catch (e) {
      console.error(e)
      notifyCustomError(e as Error)
    }
  }
}
