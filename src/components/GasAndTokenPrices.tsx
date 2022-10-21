import React, { ReactElement, useCallback } from "react"
import { AppDispatch } from "../state"
import { BLOCK_TIME } from "../constants"
import fetchFarmStats from "../utils/fetchFarmStats"
import fetchGasPrices from "../utils/updateGasPrices"
import fetchRosePriceHistory from "../utils/fetchRosePriceHistory"
import fetchStakeStats from "../utils/fetchStakeStats"
import fetchTokenPricesUSD from "../utils/updateTokenPrices"
import { useDispatch } from "react-redux"
import usePoller from "../hooks/usePoller"
import { useWeb3React } from "@web3-react/core"

export default function GasAndTokenPrices({
  children,
}: React.PropsWithChildren<unknown>): ReactElement {
  const dispatch = useDispatch<AppDispatch>()
  const { chainId, provider } = useWeb3React()

  const fetchAndUpdateGasPrice = useCallback(() => {
    void fetchGasPrices(dispatch)
  }, [dispatch])
  const fetchAndUpdateTokensPrice = useCallback(() => {
    fetchTokenPricesUSD(dispatch, chainId, provider)
  }, [dispatch, chainId, provider])
  const fetchAndUpdateFarmStats = useCallback(() => {
    void fetchFarmStats(dispatch)
  }, [dispatch])
  const fetchAndUpdateStakeStats = useCallback(() => {
    void fetchStakeStats(dispatch)
  }, [dispatch])
  const fetchAndUpdateRosePriceHistory = useCallback(() => {
    void fetchRosePriceHistory(dispatch)
  }, [dispatch])
  usePoller(fetchAndUpdateGasPrice, BLOCK_TIME * 280)
  usePoller(fetchAndUpdateTokensPrice, BLOCK_TIME * 3)
  usePoller(fetchAndUpdateFarmStats, BLOCK_TIME * 70) // ~ 15min
  usePoller(fetchAndUpdateStakeStats, BLOCK_TIME * 70)
  usePoller(fetchAndUpdateRosePriceHistory, BLOCK_TIME * 70)
  return <>{children}</>
}
