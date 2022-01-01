import "./WithdrawPage.scss"

import {
  Button,
  Center,
  Input,
  InputGroup,
  InputRightElement,
  SlideFade,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
} from "@chakra-ui/react"
import ConfirmTransaction, { ModalType } from "./ConfirmTransaction"
import { PoolDataType, UserShareType } from "../hooks/usePoolData"
import React, { ReactElement, useState } from "react"

import AdvancedOptions from "./AdvancedOptions"
import { AppState } from "../state"
import BackButton from "./BackButton"
import { BigNumber } from "@ethersproject/bignumber"
import { ContractReceipt } from "@ethersproject/contracts"
import { FRAX_STABLES_LP_POOL_NAME } from "../constants"
import Modal from "./Modal"
import MyShareCard from "./MyShareCard"
import PoolInfoCard from "./PoolInfoCard"
import RadioButton from "./RadioButton"
import ReviewWithdraw from "./ReviewWithdraw"
import TokenInput from "./TokenInput"
import TopMenu from "./TopMenu"
import { WithdrawFormState } from "../hooks/useWithdrawFormState"
import { Zero } from "@ethersproject/constants"
import classNames from "classnames"
import { formatBNToPercentString } from "../utils"
import { logEvent } from "../utils/googleAnalytics"
import { useSelector } from "react-redux"
import { useTranslation } from "react-i18next"

export interface ReviewWithdrawData {
  withdraw: {
    name: string
    value: string
    icon: string
  }[]
  rates: {
    name: string
    value: string
    rate: string
  }[]
  slippage: string
  priceImpact: BigNumber
  txnGasCost: {
    amount: BigNumber
    valueUSD: BigNumber | null // amount * ethPriceUSD
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
interface Props {
  title: string
  tokensData: Array<{
    symbol: string
    name: string
    icon: string
    inputValue: string
    max: string
  }>
  reviewData: ReviewWithdrawData
  selected?: { [key: string]: any }
  poolData: PoolDataType | null
  myShareData: UserShareType | null
  formStateData: WithdrawFormState
  onFormChange: (action: any) => void
  onConfirmTransaction: () => Promise<ContractReceipt | void>
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const WithdrawPage = (props: Props): ReactElement => {
  const { t } = useTranslation()
  const {
    tokensData,
    poolData,
    myShareData,
    onFormChange,
    formStateData,
    reviewData,
    onConfirmTransaction,
  } = props

  const { gasPriceSelected } = useSelector((state: AppState) => state.user)
  const [currentModal, setCurrentModal] = useState<string | null>(null)

  const [isOpen, setIsOpen] = useState(false)

  const onSubmit = (): void => {
    setCurrentModal("review")
  }
  const noShare = !myShareData || myShareData.lpTokenBalance.eq(Zero)

  return (
    <div className={"withdraw " + classNames({ noShare: noShare })}>
      <TopMenu activeTab={"withdraw"} />
      <div className="content">
        <div className="left">
          <div className="form">
            <Tabs
              isFitted
              variant="primary"
              onChange={() =>
                onFormChange({ fieldName: "reset", value: "reset" })
              }
            >
              <TabList>
                <Tab>Single Token</Tab>
                <Tab>Multi Token</Tab>
              </TabList>
              <TabPanels>
                <TabPanel>
                  <h3>{t("withdraw")}</h3>
                  {poolData?.name === FRAX_STABLES_LP_POOL_NAME && (
                    <p className="outdatedInfo">
                      This pool is outdated. Please withdraw your liquidity and{" "}
                      <a href="/#/pools/frax/deposit">
                        migrate to the new Frax pool
                      </a>
                      .
                    </p>
                  )}
                  <div className="percentage">
                    <span>{t("withdrawPercentage")}</span>
                    <InputGroup width="120px">
                      <Input
                        autoComplete="off"
                        autoCorrect="off"
                        placeholder="100"
                        variant="filled"
                        onChange={(
                          e: React.FormEvent<HTMLInputElement>,
                        ): void =>
                          onFormChange({
                            fieldName: "percentage",
                            value: e.currentTarget.value,
                          })
                        }
                        onFocus={(
                          e: React.ChangeEvent<HTMLInputElement>,
                        ): void => e.target.select()}
                        value={
                          formStateData.percentage
                            ? formStateData.percentage
                            : ""
                        }
                      />
                      <InputRightElement width="2rem">%</InputRightElement>
                    </InputGroup>
                  </div>
                  {formStateData.error ? (
                    <div className="error">{formStateData.error.message}</div>
                  ) : null}
                  <div
                    className="horizontalDisplay"
                    hidden={formStateData.error !== null}
                  >
                    <span>Select a Token: </span>
                    <div>
                      {tokensData.map((t) => {
                        return (
                          <RadioButton
                            key={t.symbol}
                            checked={formStateData.withdrawType === t.symbol}
                            onChange={(): void => {
                              onFormChange({
                                fieldName: "withdrawType",
                                value: t.symbol,
                              })
                              setIsOpen(true)
                            }}
                            label={t.name}
                          />
                        )
                      })}
                    </div>
                  </div>
                  <SlideFade
                    in={isOpen && !formStateData.error}
                    hidden={!isOpen || formStateData.error !== null}
                    offsetY="-30px"
                  >
                    {tokensData.map((token, index) => (
                      <div key={index}>
                        <TokenInput
                          {...token}
                          max={undefined}
                          readonly={true}
                          // inputValue={parseFloat(token.inputValue).toFixed(5)}
                          onChange={(value): void =>
                            onFormChange({
                              fieldName: "tokenInputs",
                              value: value,
                              tokenSymbol: token.symbol,
                            })
                          }
                        />
                        {index === tokensData.length - 1 ? (
                          ""
                        ) : (
                          <div className="formSpace"></div>
                        )}
                      </div>
                    ))}
                    <div className={"transactionInfoContainer"}>
                      <div className="transactionInfo">
                        <div className="transactionInfoItem">
                          {reviewData.priceImpact.gte(0) ? (
                            <span className="bonus">{t("bonus")}: </span>
                          ) : (
                            <span className="slippage">{t("priceImpact")}</span>
                          )}
                          <span
                            className={
                              "value " +
                              (reviewData.priceImpact.gte(0)
                                ? "bonus"
                                : "slippage")
                            }
                          >
                            {" "}
                            {formatBNToPercentString(
                              reviewData.priceImpact,
                              18,
                              4,
                            )}
                          </span>
                        </div>
                      </div>
                    </div>
                  </SlideFade>
                </TabPanel>
                <TabPanel>
                  <h3>Remove Imbalance</h3>
                  {poolData?.name === FRAX_STABLES_LP_POOL_NAME && (
                    <p className="outdatedInfo">
                      This pool is outdated. Please withdraw your liquidity and{" "}
                      <a href="/#/pools/frax/deposit">
                        migrate to the new Frax pool
                      </a>
                      .
                    </p>
                  )}
                  {formStateData.error ? (
                    <div className="error">{formStateData.error.message}</div>
                  ) : null}
                  {tokensData.map((token, index) => (
                    <div key={index}>
                      <TokenInput
                        {...token}
                        // inputValue={parseFloat(token.inputValue).toFixed(5)}
                        onChange={(value): void =>
                          onFormChange({
                            fieldName: "tokenInputs",
                            value: value,
                            tokenSymbol: token.symbol,
                          })
                        }
                      />
                      {index === tokensData.length - 1 ? (
                        ""
                      ) : (
                        <div className="formSpace"></div>
                      )}
                    </div>
                  ))}
                  <div className={"transactionInfoContainer"}>
                    <div className="transactionInfo">
                      <div className="transactionInfoItem">
                        {reviewData.priceImpact.gte(0) ? (
                          <span className="bonus">{t("bonus")}: </span>
                        ) : (
                          <span className="slippage">{t("priceImpact")}</span>
                        )}
                        <span
                          className={
                            "value " +
                            (reviewData.priceImpact.gte(0)
                              ? "bonus"
                              : "slippage")
                          }
                        >
                          {" "}
                          {formatBNToPercentString(
                            reviewData.priceImpact,
                            18,
                            4,
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                </TabPanel>
              </TabPanels>
            </Tabs>
          </div>
          <BackButton
            route="/pools"
            wrapperClass="goBack"
            buttonText="Go back to pools"
          />
          <AdvancedOptions />
          <Center width="100%" py={6}>
            <Button
              variant="primary"
              size="lg"
              width="240px"
              disabled={
                noShare ||
                !!formStateData.error ||
                formStateData.lpTokenAmountToSpend.isZero()
              }
              onClick={onSubmit}
            >
              {t("withdraw")}
            </Button>
          </Center>
        </div>
        <div className="infoPanels">
          <MyShareCard data={myShareData} />
          <div
            style={{
              display: myShareData ? "block" : "none",
            }}
            className="divider"
          ></div>{" "}
          <PoolInfoCard data={poolData} />
        </div>
        <Modal
          isOpen={!!currentModal}
          onClose={(): void => setCurrentModal(null)}
        >
          {currentModal === "review" ? (
            <ReviewWithdraw
              data={reviewData}
              gas={gasPriceSelected}
              onConfirm={(): void => {
                setCurrentModal("confirm")
                logEvent(
                  "withdraw",
                  (poolData && { pool: poolData?.name }) || {},
                )
                onConfirmTransaction?.()
                  .then((res) => {
                    if (res?.status) {
                      setCurrentModal(ModalType.SUCCESS)
                    } else {
                      setCurrentModal(ModalType.FAILED)
                    }
                  })
                  .catch(() => {
                    setCurrentModal(ModalType.FAILED)
                  })
              }}
              onClose={(): void => setCurrentModal(null)}
            />
          ) : null}
          {currentModal === ModalType.CONFIRM ? (
            <ConfirmTransaction />
          ) : currentModal === ModalType.FAILED ? (
            <ConfirmTransaction
              description={t("txFailed_withdraw")}
              title={t("failedTitle")}
              type={ModalType.FAILED}
            />
          ) : currentModal === ModalType.SUCCESS ? (
            <ConfirmTransaction
              title={t("successTitle")}
              description={t("txConfirmed_withdraw")}
              type={ModalType.SUCCESS}
            />
          ) : null}
        </Modal>
      </div>
    </div>
  )
}

export default WithdrawPage
