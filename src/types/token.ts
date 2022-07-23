import { BigNumber } from "@ethersproject/bignumber"

export interface TokenOption {
  name: string
  symbol: string
  icon: string
  amount: BigNumber
  amountUSD: BigNumber
  decimals?: number
}

export interface TokenProps {
  name: string
  symbol: string
  icon: string
}
