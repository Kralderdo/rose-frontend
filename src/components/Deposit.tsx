/* eslint-disable */
import { DepositTransaction, TransactionItem } from "../interfaces/transactions"
import { POOLS_MAP, PoolName, Token, isMetaPool } from "../constants"
import React, { ReactElement, useEffect, useMemo, useState } from "react"
import { TokensStateType, useTokenFormState } from "../hooks/useTokenFormState"
import { formatBNToString, getContract, shiftBNDecimals } from "../utils"
import usePoolData, { PoolDataType } from "../hooks/usePoolData"

import { AppState } from "../state"
import { BigNumber } from "@ethersproject/bignumber"
import { Contract, ContractReceipt } from "@ethersproject/contracts"
import DepositPage from "./DepositPage"
import FRAX_POOL_DEPOSIT from "../constants/abis/FraxPoolDeposit.json"
import { TokenPricesUSD } from "../state/application"
import { Zero } from "@ethersproject/constants"
import { calculatePriceImpact } from "../utils/priceImpact"
import { ethers } from "ethers"
import { formatGasToString } from "../utils/gas"
import { parseUnits } from "@ethersproject/units"
import { useActiveWeb3React } from "../hooks"
import { useApproveAndDeposit } from "../hooks/useApproveAndDeposit"
import { usePoolContract } from "../hooks/useContract"
import { usePoolTokenBalances } from "../state/wallet/hooks"
import { useSelector } from "react-redux"

interface Props {
  poolName: PoolName
}

function Deposit({ poolName }: Props): ReactElement | null {
  const POOL = POOLS_MAP[poolName]
  const { account, library, chainId } = useActiveWeb3React()
  const approveAndDeposit = useApproveAndDeposit(poolName)
  const [poolData, userShareData] = usePoolData(poolName)
  // const swapContract = useSwapContract(poolName)
  const poolContract = usePoolContract(poolName)
  const allTokens = useMemo(() => {
    return Array.from(
      new Set(POOL.poolTokens.concat(POOL.underlyingPoolTokens || [])),
    )
  }, [POOL.poolTokens, POOL.underlyingPoolTokens])
  const [tokenFormState, updateTokenFormState] = useTokenFormState(allTokens)
  const [shouldDepositWrapped, setShouldDepositWrapped] = useState(false)
  useEffect(() => {
    // empty out previous token state when switchng between wrapped and unwrapped
    if (shouldDepositWrapped) {
      updateTokenFormState(
        POOL.poolTokens.reduce(
          (acc, { symbol }) => ({
            ...acc,
            [symbol]: "",
          }),
          {},
        ),
      )
    } else {
      updateTokenFormState(
        (POOL.underlyingPoolTokens || []).reduce(
          (acc, { symbol }) => ({
            ...acc,
            [symbol]: "",
          }),
          {},
        ),
      )
    }
  }, [
    shouldDepositWrapped,
    updateTokenFormState,
    POOL.poolTokens,
    POOL.underlyingPoolTokens,
  ])
  const tokenBalances = usePoolTokenBalances()
  const { tokenPricesUSD, gasStandard, gasFast, gasInstant } = useSelector(
    (state: AppState) => state.application,
  )

  // Merge underlying token usd prices and tokenPricesUSD array
  const [underlyingPoolData] = usePoolData(POOL.underlyingPool)
  let newTokenPricesUSD
  if (underlyingPoolData.lpTokenPriceUSD != Zero) {
    const underlyingTokenUSDValue = parseFloat(
      formatBNToString(poolData.lpTokenPriceUSD, 18, 2),
    )
    newTokenPricesUSD = {
      ...tokenPricesUSD,
      ...{
        [underlyingPoolData.lpToken]: underlyingTokenUSDValue,
      },
    }
  }

  const { gasPriceSelected, gasCustom } = useSelector(
    (state: AppState) => state.user,
  )
  const gasPrice = ethers.utils.parseUnits(
    formatGasToString(
      { gasStandard, gasFast, gasInstant },
      gasPriceSelected,
      gasCustom,
    ),
    "gwei",
  )
  const [estDepositLPTokenAmount, setEstDepositLPTokenAmount] = useState(Zero)
  const [priceImpact, setPriceImpact] = useState(Zero)
  const isMetaSwap = isMetaPool(POOL.name)
  const metaSwapContract = useMemo(() => {
    if (isMetaSwap && chainId && library) {
      return getContract(
        POOL.metaSwapAddresses?.[chainId] as string,
        JSON.stringify(FRAX_POOL_DEPOSIT),
        library,
        account ?? undefined,
      ) as Contract
    }
    return null
  }, [isMetaSwap, chainId, library, POOL.metaSwapAddresses, account])

  const exceedsWallet = allTokens.some(({ symbol }) => {
    const exceedsBoolean = (tokenBalances?.[symbol] || Zero).lt(
      BigNumber.from(tokenFormState[symbol].valueSafe),
    )
    return exceedsBoolean
  })

  useEffect(() => {
    // evaluate if a new deposit will exceed the pool's per-user limit
    async function calculateMaxDeposits(): Promise<void> {
      if (
        poolContract == null ||
        userShareData == null ||
        poolData == null ||
        account == null ||
        exceedsWallet
      ) {
        setEstDepositLPTokenAmount(Zero)
        return
      }
      const tokenInputSum = parseUnits(
        allTokens
          .reduce(
            (sum, { symbol }) => sum + (+tokenFormState[symbol].valueRaw || 0),
            0,
          )
          .toFixed(18),
        18,
      )
      let depositLPTokenAmount
      if (poolData.totalLocked.gt(0) && tokenInputSum.gt(0)) {
        if (shouldDepositWrapped) {
          depositLPTokenAmount = metaSwapContract
            ? await metaSwapContract.calc_token_amount(
                (POOL.underlyingPoolTokens || []).map(({ symbol }) =>
                  BigNumber.from(tokenFormState[symbol].valueSafe),
                ),
                true, // deposit boolean
              )
            : Zero
        } else {
          const txnAmounts: BigNumber[] = POOL.poolTokens.map((poolToken) => {
            return BigNumber.from(tokenFormState[poolToken.symbol].valueSafe)
          })
          depositLPTokenAmount = await poolContract.calc_token_amount(
            txnAmounts,
            true, // deposit boolean
          )
        }
      } else {
        // when pool is empty, estimate the lptokens by just summing the input instead of calling contract
        depositLPTokenAmount = tokenInputSum
      }
      setEstDepositLPTokenAmount(depositLPTokenAmount)

      setPriceImpact(
        calculatePriceImpact(
          tokenInputSum,
          depositLPTokenAmount,
          poolData.virtualPrice,
        ),
      )
    }
    void calculateMaxDeposits()
  }, [
    poolData,
    tokenFormState,
    poolContract,
    userShareData,
    account,
    POOL.poolTokens,
    POOL.underlyingPoolTokens,
    metaSwapContract,
    shouldDepositWrapped,
    allTokens,
    exceedsWallet,
  ])

  // A represention of tokens used for UI
  const tokens = (shouldDepositWrapped
    ? POOL.underlyingPoolTokens || []
    : POOL.poolTokens
  ).map(({ symbol, name, icon, decimals }) => ({
    symbol,
    name,
    icon,
    max: formatBNToString(tokenBalances?.[symbol] || Zero, decimals),
    inputValue: tokenFormState[symbol].valueRaw,
  }))

  async function onConfirmTransaction(): Promise<ContractReceipt | void> {
    const receipt = await approveAndDeposit(
      tokenFormState,
      shouldDepositWrapped,
    )
    // Clear input after deposit
    updateTokenFormState(
      allTokens.reduce(
        (acc, t) => ({
          ...acc,
          [t.symbol]: "",
        }),
        {},
      ),
    )

    return receipt
  }
  function updateTokenFormValue(symbol: string, value: string): void {
    updateTokenFormState({ [symbol]: value })
  }
  const depositTransaction = buildTransactionData(
    tokenFormState,
    poolData,
    shouldDepositWrapped ? POOL.underlyingPoolTokens || [] : POOL.poolTokens,
    POOL.lpToken,
    priceImpact,
    estDepositLPTokenAmount,
    gasPrice,
    newTokenPricesUSD,
  )

  return (
    <DepositPage
      onConfirmTransaction={onConfirmTransaction}
      onChangeTokenInputValue={updateTokenFormValue}
      onToggleDepositWrapped={() =>
        setShouldDepositWrapped((prevState) => !prevState)
      }
      shouldDepositWrapped={shouldDepositWrapped}
      title={poolName}
      tokens={tokens}
      exceedsWallet={exceedsWallet}
      poolData={poolData}
      transactionData={depositTransaction}
    />
  )
}

function buildTransactionData(
  tokenFormState: TokensStateType,
  poolData: PoolDataType | null,
  poolTokens: Token[],
  poolLpToken: Token,
  priceImpact: BigNumber,
  estDepositLPTokenAmount: BigNumber,
  gasPrice: BigNumber,
  tokenPricesUSD?: TokenPricesUSD,
): DepositTransaction {
  const from = {
    items: [] as TransactionItem[],
    totalAmount: Zero,
    totalValueUSD: Zero,
  }
  const TOTAL_AMOUNT_DECIMALS = 18
  poolTokens.forEach((token) => {
    const { symbol, decimals } = token
    const amount = BigNumber.from(tokenFormState[symbol].valueSafe)
    const usdPriceBN = parseUnits(
      (tokenPricesUSD?.[symbol] || 0).toFixed(2),
      18,
    )
    if (amount.lte("0")) return
    const item = {
      token,
      amount,
      singleTokenPriceUSD: usdPriceBN,
      valueUSD: amount.mul(usdPriceBN).div(BigNumber.from(10).pow(decimals)),
    }
    from.items.push(item)
    from.totalAmount = from.totalAmount.add(
      shiftBNDecimals(amount, TOTAL_AMOUNT_DECIMALS - decimals),
    )
    from.totalValueUSD = from.totalValueUSD.add(usdPriceBN)
  })

  const lpTokenPriceUSD = poolData?.lpTokenPriceUSD || Zero
  const toTotalValueUSD = estDepositLPTokenAmount
    .mul(lpTokenPriceUSD)
    ?.div(BigNumber.from(10).pow(poolLpToken.decimals))
  const to = {
    item: {
      token: poolLpToken,
      amount: estDepositLPTokenAmount,
      singleTokenPriceUSD: lpTokenPriceUSD,
      valueUSD: toTotalValueUSD,
    },
    totalAmount: estDepositLPTokenAmount,
    totalValueUSD: toTotalValueUSD,
  }
  const shareOfPool = poolData?.totalLocked.gt(0)
    ? estDepositLPTokenAmount
        .mul(BigNumber.from(10).pow(18))
        .div(estDepositLPTokenAmount.add(poolData?.totalLocked))
    : BigNumber.from(10).pow(18)
  // const gasAmount = calculateGasEstimate("addLiquidity").mul(gasPrice) // units of gas * GWEI/Unit of gas
  const gasAmount = BigNumber.from(0)

  const txnGasCost = {
    amount: gasAmount,
    valueUSD: tokenPricesUSD?.ETH
      ? parseUnits(tokenPricesUSD.ETH.toFixed(2), 18) // USD / ETH  * 10^18
          .mul(gasAmount) // GWEI
          .div(BigNumber.from(10).pow(25)) // USD / ETH * GWEI * ETH / GWEI = USD
      : null,
  }

  return {
    from,
    to,
    priceImpact,
    shareOfPool,
    txnGasCost,
  }
}

export default Deposit