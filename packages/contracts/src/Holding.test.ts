import * as Web3 from 'web3'
import * as chai from 'chai'
import * as asPromised from 'chai-as-promised'
import * as contracts from './'
import * as util from 'ethereumjs-util'
import TestToken from './wrappers/TestToken'
import { BigNumber } from 'bignumber.js'
import { Debt } from './'
import * as ethers from 'ethers'
import * as solUtils from './SolidityUtils'
import * as abi from 'ethereumjs-abi'

chai.use(asPromised)

const web3 = (global as any).web3 as Web3
const assert = chai.assert

const ClearingHouse = artifacts.require<contracts.ClearingHouse.Contract>('ClearingHouse.sol')
const UnforgivingClearingHouse = artifacts.require<contracts.ClearingHouse.Contract>('UnforgivingClearingHouse.sol')
const Holding = artifacts.require<contracts.Holding.Contract>('Holding.sol')
const Token = artifacts.require<TestToken.Contract>('support/TestToken.sol')

async function signature (signer: string, digestHex: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const checksummed = util.toChecksumAddress(signer)
    web3.eth.sign(digestHex, checksummed, (err, signature) => {
      err ? reject(err) : resolve(signature)
    })
  })
}

const delay = (ms: number) => new Promise(res => setTimeout(res, ms))

contract('Holding', accounts => {
  const ALICE = accounts[0]
  const BOB = accounts[1]
  const DELEGATE_ALICE = accounts[2]
  const DELEGATE_BOB = accounts[3]
  const ALIEN = accounts[5]

  const ETH_AS_TOKEN_ADDRESS = solUtils.nullAddress()

  const ethProvider = new ethers.providers.JsonRpcProvider()

  console.log(`ALICE is ${ALICE}`)
  console.log(`BOB is ${BOB}`)

  let instanceA: contracts.Holding.Contract
  let instanceB: contracts.Holding.Contract
  let instanceClearingHouse: contracts.ClearingHouse.Contract
  let token: TestToken.Contract

  beforeEach(async () => {
    token = await Token.new()
    await token.mint(ALICE, 1000)
    await token.mint(BOB, 1000)
    instanceClearingHouse = await ClearingHouse.new()
    instanceA = await Holding.new(3, instanceClearingHouse.address, { from: ALICE })
    instanceB = await Holding.new(3, instanceClearingHouse.address, { from: BOB })
  })

  specify('constructor', async () => {
    const holding = await Holding.new(3, instanceClearingHouse.address, { from: ALICE })
    const isOwner = await holding.isOwner(ALICE)
    assert(isOwner)
  })

  describe('.deposit', () => {
    const amount = 100

    specify('tokens: usual case', async () => {
      await token.approve(instanceA.address, amount * 10, {from: ALICE})
      const balanceSizeBefore = await instanceA.balanceSize()
      const tx = await instanceA.deposit(token.address, amount, {from: ALICE})
      assert(contracts.Holding.isDidDepositEvent(tx.logs[0]))
      assert.equal(tx.logs[0].args.token, token.address)
      assert.equal(tx.logs[0].args.amount.toString(), amount.toString())

      const balanceSizeAfter = await instanceA.balanceSize()
      const tokenBalance = await token.balanceOf(instanceA.address)
      assert.equal(tokenBalance.toNumber(), 100)
      const holdingBalance = await instanceA.balance(token.address)
      assert.equal(holdingBalance.toNumber(), 100)
      assert.equal(balanceSizeAfter.toNumber(), balanceSizeBefore.toNumber() + 1)
    })

    specify('eth: usual case', async () => {
      const amount = new BigNumber(ethers.utils.parseEther('0.01').toString())

      const holdingBalanceBefore = await instanceA.balance(ETH_AS_TOKEN_ADDRESS)
      assert.equal(holdingBalanceBefore.toNumber(), 0)
      const balanceSizeBefore = await instanceA.balanceSize()

      const tx = await instanceA.deposit(ETH_AS_TOKEN_ADDRESS, amount, { from: ALICE, value: amount })
      assert(contracts.Holding.isDidDepositEvent(tx.logs[0]))
      assert.equal(tx.logs[0].args.token, ETH_AS_TOKEN_ADDRESS)
      assert.equal(tx.logs[0].args.amount.toString(), amount.toString())

      const holdingBalanceAfter = await instanceA.balance(ETH_AS_TOKEN_ADDRESS)
      assert.equal(holdingBalanceAfter.toString(), amount.toString())

      const balanceSizeAfter = await instanceA.balanceSize()
      assert.equal(balanceSizeAfter.toNumber(), balanceSizeBefore.toNumber() + 1)
    })

    specify('tokens: fail if user wants to deposit too much', async () => {
      await token.approve(instanceA.address, amount, {from: ALICE})
      const tokenBalanceBefore = await token.balanceOf(instanceA.address)
      const holdingBalanceBefore = await instanceA.balance(token.address)
      assert.equal(tokenBalanceBefore.toNumber(), 0)
      assert.equal(holdingBalanceBefore.toNumber(), 0)
      return assert.isRejected(instanceA.deposit(token.address, amount * 10, {from: ALICE}))
    })

    specify('eth: fail if user wants to deposit too much', async () => {
      const aliceBalance = new BigNumber((await ethProvider.getBalance(ALICE)).toString())
      const holdingBalanceBefore = await instanceA.balance(ETH_AS_TOKEN_ADDRESS)
      assert.equal(holdingBalanceBefore.toNumber(), 0)

      const depositBalance = aliceBalance.mul(2)
      return assert.isRejected(instanceA.deposit(ETH_AS_TOKEN_ADDRESS, depositBalance,{ from: ALICE, value: depositBalance }))
    })

    specify('eth: fail if balance does not correspond', async () => {
      return assert.isRejected(instanceA.deposit(ETH_AS_TOKEN_ADDRESS, 10,{ from: ALICE, value: 20 }))
    })
  })

  describe('.addDebt', () => {
    const amount = 10
    const settlementPeriod = 0

    specify('add debt', async () => {
      const digest = await instanceA.addDebtDigest(instanceB.address, token.address, amount, settlementPeriod)
      const signatureA = await signature(ALICE, digest)
      const signatureB = await signature(BOB, digest)
      const salt = 0x125
      const tx = await instanceA.addDebt(instanceB.address, token.address, amount, salt, settlementPeriod, signatureA, signatureB)
      const block = await ethProvider.getBlock(tx.receipt.blockNumber)

      assert(contracts.Holding.isDidAddDebtEvent(tx.logs[0]))
      const debtIdentifierResult = await instanceA.debtIdentifier(instanceB.address, token.address, salt)
      const rawDebt = await instanceA.debts(debtIdentifierResult)
      const debt = Debt.fromContract(rawDebt)
      assert.equal(debt.amount.toString(), amount.toString())
      assert.equal(debt.destination, instanceB.address)
      assert.equal(debt.token, token.address)
      assert.equal(debt.salt.toNumber(), salt)
      assert.equal(debt.collectionAfter.toNumber(), block.timestamp + settlementPeriod)
    })

    specify('ok if signed by my delegate key', async () => {
      const addSignerDigest = await instanceA.addSignerDigest(DELEGATE_ALICE)
      const signatureAddSigner = await signature(ALICE, addSignerDigest)
      await instanceA.addSigner(DELEGATE_ALICE, signatureAddSigner)
      const digest = await instanceA.addDebtDigest(instanceB.address, token.address, amount, settlementPeriod)
      const signatureA = await signature(DELEGATE_ALICE, digest)
      const signatureB = await signature(BOB, digest)
      const salt = 0x125
      const tx = await instanceA.addDebt(instanceB.address, token.address, amount, salt, settlementPeriod, signatureA, signatureB)
      const block = await ethProvider.getBlock(tx.receipt.blockNumber)

      assert(contracts.Holding.isDidAddDebtEvent(tx.logs[0]))
      const debtIdentifierResult = await instanceA.debtIdentifier.call(instanceB.address, token.address, salt)
      const rawDebt = await instanceA.debts(debtIdentifierResult)
      const debt = Debt.fromContract(rawDebt)
      assert.equal(debt.amount.toString(), amount.toString())
      assert.equal(debt.destination, instanceB.address)
      assert.equal(debt.token, token.address)
      assert.equal(debt.salt.toNumber(), salt)
      assert.equal(debt.collectionAfter.toNumber(), block.timestamp + settlementPeriod)
    })

    specify('ok if signed by others delegate key', async () => {
      const addSignerDigest = await instanceB.addSignerDigest(DELEGATE_BOB)
      const signatureAddSigner = await signature(BOB, addSignerDigest)
      await instanceB.addSigner(DELEGATE_BOB, signatureAddSigner)
      const digest = await instanceA.addDebtDigest(instanceB.address, token.address, amount, 0)
      const signatureA = await signature(ALICE, digest)
      const signatureB = await signature(DELEGATE_BOB, digest)
      const salt = 0x125
      const tx = await instanceA.addDebt(instanceB.address, token.address, amount, salt, settlementPeriod, signatureA, signatureB)
      const block = await ethProvider.getBlock(tx.receipt.blockNumber)

      assert(contracts.Holding.isDidAddDebtEvent(tx.logs[0]))
      const debtIdentifierResult = await instanceA.debtIdentifier.call(instanceB.address, token.address, salt)
      const rawDebt = await instanceA.debts(debtIdentifierResult)
      const debt = Debt.fromContract(rawDebt)
      assert.equal(debt.amount.toString(), amount.toString())
      assert.equal(debt.destination, instanceB.address)
      assert.equal(debt.token, token.address)
      assert.equal(debt.salt.toNumber(), salt)
      assert.equal(debt.collectionAfter.toNumber(), block.timestamp + settlementPeriod)
    })

    specify('can not override', async () => {
      const digest1 = await instanceA.addDebtDigest(instanceB.address, token.address, amount, 0)
      const signatureA = await signature(ALICE, digest1)
      const signatureB = await signature(BOB, digest1)
      const salt = 0x125
      await instanceA.addDebt(instanceB.address, token.address, amount, salt, settlementPeriod, signatureA, signatureB)
      const debtIdentifierResult = await instanceA.debtIdentifier.call(instanceB.address, token.address, salt)
      const rawDebt = await instanceA.debts(debtIdentifierResult)
      const debt = Debt.fromContract(rawDebt)
      assert.equal(debt.amount.toString(), amount.toString())
      assert.notEqual(debt.collectionAfter.toString(), '0')

      const amount2 = 20
      const digest2 = await instanceA.addDebtDigest(instanceB.address, token.address, amount2, 0)
      const signatureA2 = await signature(ALICE, digest2)
      const signatureB2 = await signature(BOB, digest2)
      return assert.isRejected(instanceA.addDebt(instanceB.address, token.address, amount2, salt, settlementPeriod, signatureA2, signatureB2))
    })

    specify('not if sigMine is incorrect', async () => {
      const digest = await instanceA.addDebtDigest(instanceB.address, token.address, amount, 0)
      const signatureB = await signature(BOB, digest)
      const salt = 0x125
      return assert.isRejected(instanceA.addDebt(instanceB.address, token.address, amount, salt, settlementPeriod, signatureB, signatureB))
    })

    specify('not if sigOther is incorrect', async () => {
      const digest = await instanceA.addDebtDigest(instanceB.address, token.address, amount, 0)
      const signatureA = await signature(ALICE, digest)
      const salt = 0x125
      return assert.isRejected(instanceA.addDebt(instanceB.address, token.address, amount, salt, settlementPeriod, signatureA, signatureA))
    })

    specify('not if dismissed', async () => {
      const instance = await Holding.new(0, instanceClearingHouse.address, { from: ALICE })
      const retireDigest = await instance.retireDigest(instance.address)
      const retireSig = await signature(ALICE, retireDigest)
      await instance.retire(retireSig)
      const stateAfterRetire = await instance.currentState()
      assert.equal(stateAfterRetire.toString(), '2')

      const addSignerDigest = await instanceB.addSignerDigest(DELEGATE_BOB)
      const signatureAddSigner = await signature(BOB, addSignerDigest)
      await instanceB.addSigner(DELEGATE_BOB, signatureAddSigner)
      const digest = await instance.addDebtDigest(instanceB.address, token.address, amount, 0)
      const signatureA = await signature(ALICE, digest)
      const signatureB = await signature(DELEGATE_BOB, digest)
      const salt = 0x125

      return assert.isRejected(instance.addDebt(instanceB.address, token.address, amount, salt, settlementPeriod, signatureA, signatureB))
    })
  })

  describe('.collectDebt', () => {
    const AMOUNT = 10
    const SETTLEMENT_PERIOD = 0
    const NONCE = 0x125

    specify('tokens: usual case', async () => {
      await token.approve(instanceA.address, 1000, {from: ALICE})
      await instanceA.deposit(token.address, AMOUNT, {from: ALICE})
      const digest = await instanceA.addDebtDigest(instanceB.address, token.address, AMOUNT, SETTLEMENT_PERIOD)
      const signatureA = await signature(ALICE, digest)
      const signatureB = await signature(BOB, digest)
      await instanceA.addDebt(instanceB.address, token.address, AMOUNT, NONCE, SETTLEMENT_PERIOD, signatureA, signatureB)

      const balanceBefore = await token.balanceOf(instanceB.address)
      const holdingBefore = await instanceB.balance(token.address)
      const debtId = await instanceA.debtIdentifier(instanceB.address, token.address, NONCE)

      const collectDigest = await instanceA.collectDigest(debtId)
      const collectSignature = await signature(BOB, collectDigest)
      let tx = await instanceA.collectDebt(debtId, collectSignature)
      assert(contracts.Holding.isDidCloseEvent(tx.logs[0]))
      assert(contracts.Holding.isDidDepositEvent(tx.logs[1]))
      assert(contracts.Holding.isDidOnCollectDebtEvent(tx.logs[2]))
      assert(contracts.Holding.isDidCollectEvent(tx.logs[3]))
      const balanceAfter = await token.balanceOf(instanceB.address)
      assert.equal(balanceAfter.sub(balanceBefore).toString(), AMOUNT.toString())

      const holdingAfter = await instanceB.balance(token.address)
      assert.equal(holdingAfter.sub(holdingBefore).toString(), AMOUNT.toString())
    })

    specify('eth: usual case', async () => {
      const value = new BigNumber(ethers.utils.parseEther('0.01').toString())
      await instanceA.deposit(ETH_AS_TOKEN_ADDRESS, value, { from: ALICE, value: value })
      const holdingBalanceBefore = await instanceA.balance(ETH_AS_TOKEN_ADDRESS)
      assert.equal(ethers.utils.formatEther(holdingBalanceBefore.toString()), '0.01')
      const digest = await instanceA.addDebtDigest(instanceB.address, ETH_AS_TOKEN_ADDRESS, value, 0)
      const signatureA = await signature(ALICE, digest)
      const signatureB = await signature(BOB, digest)
      await instanceA.addDebt(instanceB.address, ETH_AS_TOKEN_ADDRESS, new BigNumber(value.toNumber()), NONCE, SETTLEMENT_PERIOD, signatureA, signatureB)
      const debtId = await instanceA.debtIdentifier(instanceB.address, ETH_AS_TOKEN_ADDRESS, NONCE)
      const collectDigest = await instanceA.collectDigest(debtId)
      const collectSignature = await signature(BOB, collectDigest)
      await instanceA.collectDebt(debtId, collectSignature)
      const holdingBalanceAfter = await instanceA.balance(ETH_AS_TOKEN_ADDRESS)
      assert.equal(holdingBalanceBefore.sub(holdingBalanceAfter).toString(), value.toString(),
'Subtract of holding balances must be equal to -value')
    })

    specify('not if not present', async () => {
      const collectDigest = await instanceA.collectDigest(ETH_AS_TOKEN_ADDRESS)
      const collectSignature = await signature(BOB, collectDigest)
      const debtIdentifierResult = await instanceA.debtIdentifier(instanceB.address, ETH_AS_TOKEN_ADDRESS, NONCE)
      return assert.isRejected(instanceA.collectDebt(debtIdentifierResult, collectSignature))
    })

    specify('not if not collectable', async () => {
      const SETTLEMENT_PERIOD = 100
      await token.approve(instanceA.address, 1000, {from: ALICE})
      await instanceA.deposit(token.address, AMOUNT, {from: ALICE})
      const digest = await instanceA.addDebtDigest(instanceB.address, token.address, AMOUNT, SETTLEMENT_PERIOD)
      const signatureA = await signature(ALICE, digest)
      const signatureB = await signature(BOB, digest)
      await instanceA.addDebt(instanceB.address, token.address, AMOUNT, NONCE, SETTLEMENT_PERIOD, signatureA, signatureB)
      const collectDigest = await instanceA.collectDigest(token.address)
      const collectSignature = await signature(BOB, collectDigest)

      const debtIdentifierResult = await instanceA.debtIdentifier(instanceB.address, token.address, NONCE)
      return assert.isRejected(instanceA.collectDebt(debtIdentifierResult, collectSignature))
    })
  })

  describe('.withdraw', () => {
    const amount = 100
    const withdrawal = 10

    specify('tokens: happy case', async () => {
      await token.approve(instanceA.address, amount * 10, {from: ALICE})
      await instanceA.deposit(token.address, amount, {from: ALICE})
      const tokenBalance = await token.balanceOf(instanceA.address)
      assert.equal(tokenBalance.toNumber(), amount)
      const holdingBalance = await instanceA.balance(token.address)
      assert.equal(holdingBalance.toNumber(), amount)

      const digest = await instanceA.withdrawDigest(BOB, token.address, withdrawal)
      const signatureA = await signature(ALICE, digest)
      const balanceBefore = await token.balanceOf(BOB)

      const tx = await instanceA.withdraw(BOB, token.address, withdrawal, signatureA)

      assert(contracts.Holding.isDidWithdrawEvent(tx.logs[0]))
      assert.equal(tx.logs[0].args.destination, BOB)
      assert.equal(tx.logs[0].args.token, token.address)
      assert.equal(tx.logs[0].args.amount.toString(), withdrawal.toString())

      const balanceAfter = await token.balanceOf(BOB)
      assert.equal(balanceAfter.sub(balanceBefore).toString(), withdrawal.toString())
      const holdingBalanceAfter = await instanceA.balance(token.address)
      assert.equal(holdingBalanceAfter.sub(holdingBalance).toNumber(), -1 * withdrawal)
    })

    specify('tokens: happy case: total withdrawal', async () => {
      await token.approve(instanceA.address, amount * 10, {from: ALICE})
      await instanceA.deposit(token.address, amount, {from: ALICE})
      const tokenBalance = await token.balanceOf(instanceA.address)
      assert.equal(tokenBalance.toNumber(), amount)
      const holdingBalance = await instanceA.balance(token.address)
      assert.equal(holdingBalance.toNumber(), amount)

      const digest = await instanceA.withdrawDigest(BOB, token.address, amount)
      const signatureA = await signature(ALICE, digest)
      const balanceBefore = await token.balanceOf(BOB)
      const balanceSizeBefore = await instanceA.balanceSize()

      const tx = await instanceA.withdraw(BOB, token.address, amount, signatureA)

      assert(contracts.Holding.isDidWithdrawEvent(tx.logs[0]))
      assert.equal(tx.logs[0].args.destination, BOB)
      assert.equal(tx.logs[0].args.token, token.address)
      assert.equal(tx.logs[0].args.amount.toString(), amount.toString())

      const balanceSizeAfter = await instanceA.balanceSize()

      const balanceAfter = await token.balanceOf(BOB)
      assert.equal(balanceAfter.sub(balanceBefore).toString(), amount.toString())
      const holdingBalanceAfter = await instanceA.balance(token.address)
      assert.equal(holdingBalanceAfter.sub(holdingBalance).toNumber(), -1 * amount)
      assert.equal(balanceSizeAfter.sub(balanceSizeBefore).toNumber(), -1)
    })

    specify('eth: happy case', async () => {
      await instanceA.deposit(ETH_AS_TOKEN_ADDRESS, amount, { from: ALICE, value: amount })

      const holdingBalanceBefore = await instanceA.balance(ETH_AS_TOKEN_ADDRESS)
      assert.equal(holdingBalanceBefore.toNumber(), amount)

      const digest = await instanceA.withdrawDigest(BOB, ETH_AS_TOKEN_ADDRESS, withdrawal)
      const signatureA = await signature(ALICE, digest)
      const balanceBefore = await ethProvider.getBalance(BOB)
      const tx = await instanceA.withdraw(BOB, ETH_AS_TOKEN_ADDRESS, withdrawal, signatureA)

      assert(contracts.Holding.isDidWithdrawEvent(tx.logs[0]))
      assert.equal(tx.logs[0].args.destination, BOB)
      assert.equal(tx.logs[0].args.token, ETH_AS_TOKEN_ADDRESS)
      assert.equal(tx.logs[0].args.amount.toString(), withdrawal.toString())

      const balanceAfter = await ethProvider.getBalance(BOB)
      assert.equal(balanceAfter.sub(balanceBefore).toNumber(),
        withdrawal,
        'Subtract of balances must be equal to withdrawal')
      const holdingBalanceAfter = await instanceA.balance(ETH_AS_TOKEN_ADDRESS)
      assert.equal(holdingBalanceBefore.sub(holdingBalanceAfter).toNumber(),
        withdrawal,
        'Subtract of holding balances must be equal to -withdrawal')
    })

    specify('tokens: fail if user wants to withdraw too much', async () => {
      await token.approve(instanceA.address, 1000, {from: ALICE})
      await instanceA.deposit(token.address, 100, {from: ALICE})
      const tokenBalance = await token.balanceOf(instanceA.address)
      assert.equal(tokenBalance.toString(), '100')
      const holdingBalance = await instanceA.balance(token.address)
      assert.equal(holdingBalance.toString(), '100')

      const withdrawal = 100000000
      const digest = await instanceA.withdrawDigest(BOB, token.address, withdrawal)
      const signatureA = await signature(ALICE, digest)
      return assert.isRejected(instanceA.withdraw(BOB, token.address, withdrawal, signatureA))
    })

    specify('tokens: fail if signature is wrong', async () => {
      await token.approve(instanceA.address, 1000, {from: ALICE})
      await instanceA.deposit(token.address, 100, {from: ALICE})
      const tokenBalance = await token.balanceOf(instanceA.address)
      assert.equal(tokenBalance.toString(), '100')
      const holdingBalance = await instanceA.balance(token.address)
      assert.equal(holdingBalance.toString(), '100')

      return assert.isRejected(instanceA.withdraw(BOB, token.address, withdrawal, '0xdead'))
    })

    specify('eth: fail if user wants to withdraw too much', async () => {
      await instanceA.deposit(ETH_AS_TOKEN_ADDRESS, amount, { from: ALICE, value: amount })

      const holdingBalanceBefore = await instanceA.balance(ETH_AS_TOKEN_ADDRESS)
      assert.equal(holdingBalanceBefore.toNumber(), amount)

      const withdrawal = amount * 10
      const digest = await instanceA.withdrawDigest(BOB, ETH_AS_TOKEN_ADDRESS, withdrawal)
      const signatureA = await signature(ALICE, digest)
      return assert.isRejected(instanceA.withdraw(BOB, ETH_AS_TOKEN_ADDRESS, withdrawal, signatureA))
    })

    specify('eth: fail if signature is wrong', async () => {
      await instanceA.deposit(ETH_AS_TOKEN_ADDRESS, amount,{ from: ALICE, value: amount })
      return assert.isRejected(instanceA.withdraw(BOB, ETH_AS_TOKEN_ADDRESS, withdrawal, '0xdead'))
    })
  })

  describe('.forgiveDebt', () => {
    const NONCE = 0x125
    const amount = 100

    specify('forgive', async () => {
      await token.approve(instanceA.address, 1000, {from: ALICE})
      await instanceA.deposit(token.address, amount, {from: ALICE})

      const digestAddDebt = await instanceA.addDebtDigest(instanceB.address, token.address, amount, 0)
      const signatureAAddDebt = await signature(ALICE, digestAddDebt)
      const signatureBAddDebt = await signature(BOB, digestAddDebt)
      await instanceA.addDebt(instanceB.address, token.address, amount, NONCE, 0, signatureAAddDebt, signatureBAddDebt)

      const tokenBalance = await token.balanceOf(instanceA.address)
      assert.equal(tokenBalance.toString(), '100')
      const holdingBalance = await instanceA.balance(token.address)
      assert.equal(holdingBalance.toString(), '100')

      const digest = await instanceA.forgiveDigest(instanceB.address, token.address)
      const signatureB = await signature(BOB, digest)
      const debtIdentifierResult = await instanceA.debtIdentifier(instanceB.address, token.address, NONCE)
      const debtsSizeBefore = await instanceA.debtsSize()
      await instanceA.forgiveDebt(debtIdentifierResult, signatureB)
      const debtsSizeAfter = await instanceA.debtsSize()
      const rawDebt = await instanceA.debts(debtIdentifierResult)
      const debt = Debt.fromContract(rawDebt)
      assert.equal(debt.amount.toNumber(), 0)
      assert.equal(debt.collectionAfter.toNumber(), 0)
      assert.equal(debtsSizeAfter.toNumber(), debtsSizeBefore.toNumber() - 1)
    })

    specify('not if no debt', async () => {
      const digest = await instanceA.forgiveDigest(instanceB.address, token.address)
      const signatureB = await signature(BOB, digest)
      const debtIdentifierResult = await instanceA.debtIdentifier(instanceB.address, token.address, NONCE)
      return assert.isRejected(instanceA.forgiveDebt(debtIdentifierResult, signatureB))
    })

    specify('not if wrong signature', async () => {
      await token.approve(instanceA.address, 1000, {from: ALICE})
      await instanceA.deposit(token.address, amount, {from: ALICE})

      const digestAddDebt = await instanceA.addDebtDigest(instanceB.address, token.address, amount, 0)
      const signatureAAddDebt = await signature(ALICE, digestAddDebt)
      const signatureBAddDebt = await signature(BOB, digestAddDebt)
      await instanceA.addDebt(instanceB.address, token.address, amount, NONCE, 0, signatureAAddDebt, signatureBAddDebt)

      const tokenBalance = await token.balanceOf(instanceA.address)
      assert.equal(tokenBalance.toString(), '100')
      const holdingBalance = await instanceA.balance(token.address)
      assert.equal(holdingBalance.toString(), '100')

      const debtIdentifierResult = await instanceA.debtIdentifier(instanceB.address, token.address, NONCE)
      return assert.isRejected(instanceA.forgiveDebt(debtIdentifierResult, '0xdead'))
    })

    specify('not if ClearingHouse rejects', async () => {
      const unforgivingClearingHouse = await UnforgivingClearingHouse.new()
      const instance = await Holding.new(3, unforgivingClearingHouse.address, { from: ALICE })

      await token.approve(instance.address, 1000, {from: ALICE})
      await instance.deposit(token.address, amount, {from: ALICE})

      const digestAddDebt = await instance.addDebtDigest(instanceB.address, token.address, amount, 0)
      const signatureAAddDebt = await signature(ALICE, digestAddDebt)
      const signatureBAddDebt = await signature(BOB, digestAddDebt)
      await instance.addDebt(instanceB.address, token.address, amount, NONCE, 0, signatureAAddDebt, signatureBAddDebt)

      const tokenBalance = await token.balanceOf(instance.address)
      assert.equal(tokenBalance.toString(), '100')
      const holdingBalance = await instance.balance(token.address)
      assert.equal(holdingBalance.toString(), '100')

      const digest = await instance.forgiveDigest(instanceB.address, token.address)
      const signatureB = await signature(BOB, digest)
      const debtIdentifierResult = await instance.debtIdentifier(instanceB.address, token.address, NONCE)
      return assert.isRejected(instance.forgiveDebt(debtIdentifierResult, signatureB))
    })
  })

  describe('.retire', () => {
    specify('usual case', async () => {
      const retireDigest = await instanceA.retireDigest(instanceA.address)
      const signatureARetire = await signature(ALICE, retireDigest)
      const currentState = await instanceA.currentState.call()
      assert.equal(currentState.toString(), '0')
      await instanceA.retire(signatureARetire)
      const currentState2 = await instanceA.currentState.call()
      assert.equal(currentState2.toString(), '1')
    })

    specify('not in Active state', async () => {
      const retireDigest = await instanceA.retireDigest(instanceA.address)
      const signatureARetire = await signature(ALICE, retireDigest)
      await instanceA.retire(signatureARetire)
      return assert.isRejected(instanceA.retire(signatureARetire))
    })

    specify('must fails when owner\' signature is wrong', async () => {
      const retireDigest = await instanceA.retireDigest(instanceA.address)
      const signatureDARetire = await signature(DELEGATE_ALICE, retireDigest)
      return assert.isRejected(instanceA.retire(signatureDARetire))
    })
  })

  specify('currentState', async () => {
    const retireDigest = await instanceA.retireDigest(instanceA.address)
    const signatureARetire = await signature(ALICE, retireDigest)
    const currentState = await instanceA.currentState.call()
    assert.equal(currentState.toString(), '0')
    await instanceA.retire(signatureARetire)
    const currentState2 = await instanceA.currentState.call()
    assert.equal(currentState2.toString(), '1')
  })

  describe('.stop', () => {
    specify('usual case', async () => {
      const retireDigest = await instanceA.retireDigest(instanceA.address)
      const signatureARetire = await signature(ALICE, retireDigest)
      const currentState = await instanceA.currentState.call()
      assert.equal(currentState.toString(), '0')
      await instanceA.retire(signatureARetire)

      await delay(4000)
      await instanceA.stop()
      await assert.isRejected(instanceA.currentState.call()) // tslint:disable-line:await-promise
    })

    specify('must fails because of non-empty debts', async () => {
      await token.approve(instanceA.address, 100, { from: ALICE })
      await instanceA.deposit(token.address, 100, { from: ALICE })
      const digest = await instanceA.addDebtDigest(instanceB.address, token.address, 100, 0)
      const signatureA = await signature(ALICE, digest)
      const signatureB = await signature(BOB, digest)
      const salt = 0x125
      await instanceA.addDebt(instanceB.address, token.address, 100, salt, 0, signatureA, signatureB)

      const retireDigest = await instanceA.retireDigest(instanceA.address)
      const signatureARetire = await signature(ALICE, retireDigest)
      const currentState = await instanceA.currentState.call()
      assert.equal(currentState.toString(), '0')
      await instanceA.retire(signatureARetire)

      await delay(4000)
      await assert.isRejected(instanceA.stop()) // tslint:disable-line:await-promise
    })

    specify('must fails because of non-empty balances', async () => {
      await token.approve(instanceA.address, 100, { from: ALICE })
      await instanceA.deposit(token.address, 100, { from: ALICE })
      const retireDigest = await instanceA.retireDigest(instanceA.address)
      const signatureARetire = await signature(ALICE, retireDigest)
      const currentState = await instanceA.currentState.call()
      assert.equal(currentState.toString(), '0')
      await instanceA.retire(signatureARetire)

      await delay(4000)
      await assert.isRejected(instanceA.stop()) // tslint:disable-line:await-promise
    })
  })

  describe('.ownable', () => {
    describe('.isOwner', () => {
      specify('yes, it is owner', async () => {
        const isOwner = await instanceA.isOwner(ALICE)
        assert(isOwner)
      })

      specify('not an owner', async () => {
        const isOwner = await instanceA.isOwner(BOB)
        assert(!isOwner)
      })
    })

    describe('.addOwner', () => {
      specify('usual case', async () => {
        const isOwnerBefore = await instanceA.isOwner(ALIEN)
        assert(!isOwnerBefore)
        const addOwnerDigest = await instanceA.addOwnerDigest(ALIEN)
        const signatureAddOwner = await signature(ALICE, addOwnerDigest)
        await instanceA.addOwner(ALIEN, signatureAddOwner)
        const isOwnerAfter = await instanceA.isOwner(ALIEN)
        assert(isOwnerAfter)
      })

      specify('must fails when signature of new owner is wrong', async () => {
        const isOwnerBefore = await instanceA.isOwner(ALIEN)
        assert(!isOwnerBefore)
        const addOwnerDigest = await instanceA.addOwnerDigest(ALIEN)
        const signatureAddOwner = await signature(BOB, addOwnerDigest)
        await assert.isRejected(instanceA.addOwner(ALIEN, signatureAddOwner)) // tslint:disable-line:await-promise
        const isOwnerAfter = await instanceA.isOwner(ALIEN)
        assert(!isOwnerAfter)
      })
    })

    describe('.removeOwner', () => {
      specify('usual case', async () => {
        const isOwnerBefore = await instanceA.isOwner(ALIEN)
        assert(!isOwnerBefore)
        const addOwnerDigest = await instanceA.addOwnerDigest(ALIEN)
        const signatureAddOwner = await signature(ALICE, addOwnerDigest)
        await instanceA.addOwner(ALIEN, signatureAddOwner)
        const isOwnerAfter = await instanceA.isOwner(ALIEN)
        assert(isOwnerAfter)
        const removeOwnerDigest = await instanceA.removeOwnerDigest(ALIEN)
        const signatureRemoveOwner = await signature(ALIEN, removeOwnerDigest)
        await instanceA.removeOwner(ALIEN, signatureRemoveOwner)
        const isOwnerAfterRemoving = await instanceA.isOwner(ALIEN)
        assert(!isOwnerAfterRemoving)
      })

      specify('must fails when signature of owner is wrong', async () => {
        const isOwnerBefore = await instanceA.isOwner(ALIEN)
        assert(!isOwnerBefore)
        const addOwnerDigest = await instanceA.addOwnerDigest(ALIEN)
        const signatureAddOwner = await signature(ALICE, addOwnerDigest)
        await instanceA.addOwner(ALIEN, signatureAddOwner)
        const isOwnerAfter = await instanceA.isOwner(ALIEN)
        assert(isOwnerAfter)
        const removeOwnerDigest = await instanceA.removeOwnerDigest(ALIEN)
        const signatureRemoveOwner = await signature(BOB, removeOwnerDigest)
        await assert.isRejected(instanceA.removeOwner(ALIEN, signatureRemoveOwner)) // tslint:disable-line:await-promise
        const isOwnerAfterRemoving = await instanceA.isOwner(ALIEN)
        assert(isOwnerAfterRemoving)
      })
    })
  })

  describe('.signers', () => {
    describe('.isSigner', () => {
      specify('yes, it is signer', async () => {
        const isOwner = await instanceA.isSigner(ALICE)
        assert(isOwner)
      })

      specify('not an signer', async () => {
        const isOwner = await instanceA.isOwner(BOB)
        assert(!isOwner)
      })
    })

    describe('.addSigner', () => {
      specify('usual case', async () => {
        const isSignerBefore = await instanceA.isSigner(ALIEN)
        assert(!isSignerBefore)
        const addSignerDigest = await instanceA.addSignerDigest(ALIEN)
        const signatureAddSigner = await signature(ALICE, addSignerDigest)
        await instanceA.addSigner(ALIEN, signatureAddSigner)
        const isSignerAfter = await instanceA.isSigner(ALIEN)
        assert(isSignerAfter)
      })

      specify('must fails when signature of new signer is wrong', async () => {
        const isSignerBefore = await instanceA.isSigner(ALIEN)
        assert(!isSignerBefore)
        const addSignerDigest = await instanceA.addSignerDigest(ALIEN)
        const signatureAddSigner = await signature(BOB, addSignerDigest)
        await assert.isRejected(instanceA.addSigner(ALIEN, signatureAddSigner)) // tslint:disable-line:await-promise
        const isSignerAfter = await instanceA.isSigner(ALIEN)
        assert(!isSignerAfter)
      })
    })

    describe('.removeSigner', () => {
      specify('usual case', async () => {
        const isSignerBefore = await instanceA.isSigner(ALIEN)
        assert(!isSignerBefore)
        const addSignerDigest = await instanceA.addSignerDigest(ALIEN)
        const signatureAddSigner = await signature(ALICE, addSignerDigest)
        await instanceA.addSigner(ALIEN, signatureAddSigner)
        const isSignerAfter = await instanceA.isSigner(ALIEN)
        assert(isSignerAfter)
        const removeSignerDigest = await instanceA.removeSignerDigest(ALIEN)
        const signatureRemoveSigner = await signature(ALICE, removeSignerDigest)
        await instanceA.removeSigner(ALIEN, signatureRemoveSigner)
        const isSignerAfterRemoving = await instanceA.isSigner(ALIEN)
        assert(!isSignerAfterRemoving)
      })

      specify('must fails when signature of signer is wrong', async () => {
        const isSingerBefore = await instanceA.isSigner(ALIEN)
        assert(!isSingerBefore)
        const addSignerDigest = await instanceA.addSignerDigest(ALIEN)
        const signatureAddSigner = await signature(ALICE, addSignerDigest)
        await instanceA.addSigner(ALIEN, signatureAddSigner)
        const isSignerAfter = await instanceA.isSigner(ALIEN)
        assert(isSignerAfter)
        const removeSignerDigest = await instanceA.removeSignerDigest(ALIEN)
        const signatureRemoveSigner = await signature(BOB, removeSignerDigest)
        await assert.isRejected(instanceA.removeSigner(ALIEN, signatureRemoveSigner)) // tslint:disable-line:await-promise
        const isSignerAfterRemoving = await instanceA.isSigner(ALIEN)
        assert(isSignerAfterRemoving)
      })
    })
  })

  describe('.removeDebt', () => {
    const amount = 1000
    const settlementPeriod = 0
    const salt = 0x125

    specify('happy case', async () => {
      await token.approve(instanceA.address, amount, {from: ALICE})
      await instanceA.deposit(token.address, amount, {from: ALICE})
      const digest = await instanceA.addDebtDigest(instanceB.address, token.address, amount, settlementPeriod)
      const signatureA = await signature(ALICE, digest)
      const signatureB = await signature(BOB, digest)
      await instanceA.addDebt(instanceB.address, token.address, amount, salt, settlementPeriod, signatureA, signatureB)

      const balanceBefore = await token.balanceOf(instanceB.address)
      const holdingBefore = await instanceB.balance(token.address)
      const debtId = await instanceA.debtIdentifier.call(instanceB.address, token.address, salt)
      const collectDigest = await instanceA.collectDigest(debtId)
      const collectSignature = await signature(BOB, collectDigest)
      let tx = await instanceA.collectDebt(debtId, collectSignature)
      assert(contracts.Holding.isDidCloseEvent(tx.logs[0]))
      assert(contracts.Holding.isDidDepositEvent(tx.logs[1]))
      assert(contracts.Holding.isDidOnCollectDebtEvent(tx.logs[2]))
      assert(contracts.Holding.isDidCollectEvent(tx.logs[3]))
      const balanceAfter = await token.balanceOf(instanceB.address)

      assert.equal(balanceAfter.sub(balanceBefore).toString(), amount.toString())
      const holdingAfter = await instanceB.balance(token.address)
      assert.equal(holdingAfter.sub(holdingBefore).toString(), amount.toString())

      const tx2 = await instanceA.removeDebt(debtId)
      assert(contracts.Holding.isDidRemoveDebtEvent(tx2.logs[0]))
    })

    specify('not if no debt', async () => {
      const debtIdentifierResult = await instanceA.debtIdentifier.call(instanceB.address, token.address, salt)
      const rawDebt = await instanceA.debts(debtIdentifierResult)
      const debt = Debt.fromContract(rawDebt)
      assert.equal(debt.amount.toNumber(), 0)
      assert.equal(debt.collectionAfter.toNumber(), 0)
      return assert.isRejected(instanceA.removeDebt(debtIdentifierResult))
    })
  })

  describe('debtIdentifier', () => {
    specify('contains address, destination, token, salt', async () => {
      const destination = instanceB.address
      const tokenAddress = token.address
      const nonce = 29
      const actual = await instanceA.debtIdentifier(destination, tokenAddress, nonce)
      const packed = abi.rawEncode(
        ['address', 'address', 'address', 'uint16'],
        [instanceA.address, destination, tokenAddress, nonce]
      )
      const expected = ethers.utils.keccak256(util.bufferToHex(packed))
      assert.equal(actual, expected)
    })
  })

  describe('onCollectDebt', () => {
    const amount = 100

    specify('effectively do deposit in tokens', async () => {
      await token.approve(instanceA.address, amount * 10, {from: ALICE})
      await instanceA.deposit(token.address, amount, {from: ALICE})
      const tokenBalance = await token.balanceOf(instanceA.address)
      assert.equal(tokenBalance.toNumber(), amount)
      const holdingBalance = await instanceA.balance(token.address)
      assert.equal(holdingBalance.toNumber(), amount)
    })

    specify('effectively do deposit in eth', async () => {
      const holdingBalanceBefore = await instanceA.balance(ETH_AS_TOKEN_ADDRESS)
      assert.equal(holdingBalanceBefore.toNumber(), 0)
      const ethAmount = new BigNumber(ethers.utils.parseEther('0.01').toString())

      await instanceA.deposit(ETH_AS_TOKEN_ADDRESS, ethAmount, { from: ALICE, value: ethAmount })

      const holdingBalanceAfter = await instanceA.balance(ETH_AS_TOKEN_ADDRESS)
      assert.equal(holdingBalanceAfter.toString(), ethAmount.toString())
    })

    specify('not if wrong eth amount', async () => {
      const holdingBalanceBefore = await instanceA.balance(ETH_AS_TOKEN_ADDRESS)
      assert.equal(holdingBalanceBefore.toNumber(), 0)
      const ethAmount = new BigNumber(ethers.utils.parseEther('0.01').toString())

      return assert.isRejected(instanceA.deposit(ETH_AS_TOKEN_ADDRESS, ethAmount, { from: ALICE }))
    })
  })
})
