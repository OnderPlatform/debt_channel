import * as Web3 from 'web3'
import * as chai from 'chai'
import * as asPromised from 'chai-as-promised'
import * as contracts from './'
import * as util from 'ethereumjs-util'
import TestToken from './wrappers/TestToken'
import { Debt } from './'

chai.use(asPromised)

const web3 = (global as any).web3 as Web3
const assert = chai.assert

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
  const CLEARING_HOUSE_ADDRESS = accounts[4]
  const ALIEN = accounts[5]

  console.log(`ALICE is ${ALICE}`)
  console.log(`BOB is ${BOB}`)

  let instanceA: contracts.Holding.Contract
  let instanceB: contracts.Holding.Contract
  let token: TestToken.Contract

  beforeEach(async () => {
    token = await Token.new()
    await token.mint(ALICE, 1000)
    await token.mint(BOB, 1000)
    instanceA = await Holding.new(ALICE, 3, CLEARING_HOUSE_ADDRESS, { from: ALICE })
    instanceB = await Holding.new(BOB, 3, CLEARING_HOUSE_ADDRESS, { from: BOB })
  })

  specify('constructor', async () => {
    const holding = await Holding.new(ALICE, 3, CLEARING_HOUSE_ADDRESS, { from: ALICE })
    const isOwner = await holding.isOwner(ALICE)
    assert(isOwner)
  })

  specify('.deposit', async () => {
    await token.approve(instanceA.address, 1000, {from: ALICE})
    await instanceA.deposit(token.address, 100, {from: ALICE})
    const tokenBalance = await token.balanceOf(instanceA.address)
    assert.equal(tokenBalance.toString(), '100')
    const holdingBalance = await instanceA.balance(token.address)
    assert.equal(holdingBalance.toString(), '100')
  })

  describe('.addDebt', () => {
    const amount = 10
    const settlementPeriod = 0

    specify('add debt', async () => {
      const digest = await instanceA.addDebtDigest(instanceB.address, token.address, amount, 0)
      const signatureA = await signature(ALICE, digest)
      const signatureB = await signature(BOB, digest)
      const salt = 0x125
      const tx = await instanceA.addDebt(instanceB.address, token.address, amount, salt, settlementPeriod, signatureA, signatureB)
      assert(contracts.Holding.isDidAddDebtEvent(tx.logs[0]))
      const debtIdentifierResult = await instanceA.debtIdentifier.call(instanceB.address, token.address, salt)
      const rawDebt = await instanceA.debts(debtIdentifierResult)
      const debt = Debt.fromContract(rawDebt)
      assert.equal(debt.amount.toString(), amount.toString())
      assert.notEqual(debt.collectionAfter.toString(), '0')
    })

    specify('pass if sigMine is incorrect', async () => {
      const digest = await instanceA.addDebtDigest(instanceB.address, token.address, amount, 0)
      const signatureB = await signature(BOB, digest)
      const salt = 0x125
      return assert.isRejected(instanceA.addDebt(instanceB.address, token.address, amount, salt, settlementPeriod, signatureB, signatureB))
    })

    specify('ok if signed by my delegate key', async () => {
      await instanceA.addSigner(DELEGATE_ALICE, {from: ALICE})
      const digest = await instanceA.addDebtDigest(instanceB.address, token.address, amount, 0)
      const signatureA = await signature(DELEGATE_ALICE, digest)
      const signatureB = await signature(BOB, digest)
      const salt = 0x125
      const tx = await instanceA.addDebt(instanceB.address, token.address, amount, salt, settlementPeriod, signatureA, signatureB)
      assert(contracts.Holding.isDidAddDebtEvent(tx.logs[0]))
      const debtIdentifierResult = await instanceA.debtIdentifier.call(instanceB.address, token.address, salt)
      const rawDebt = await instanceA.debts(debtIdentifierResult)
      const debt = Debt.fromContract(rawDebt)
      assert.equal(debt.amount.toString(), amount.toString())
      assert.notEqual(debt.collectionAfter.toString(), '0')
    })

    specify('ok if signed by others delegate key', async () => {
      await instanceB.addSigner(DELEGATE_BOB, {from: BOB})
      const digest = await instanceA.addDebtDigest(instanceB.address, token.address, amount, 0)
      const signatureA = await signature(ALICE, digest)
      const signatureB = await signature(DELEGATE_BOB, digest)
      const salt = 0x125
      const tx = await instanceA.addDebt(instanceB.address, token.address, amount, salt, settlementPeriod, signatureA, signatureB)
      assert(contracts.Holding.isDidAddDebtEvent(tx.logs[0]))
      const debtIdentifierResult = await instanceA.debtIdentifier.call(instanceB.address, token.address, salt)
      const rawDebt = await instanceA.debts(debtIdentifierResult)
      const debt = Debt.fromContract(rawDebt)
      assert.equal(debt.amount.toString(), amount.toString())
      assert.notEqual(debt.collectionAfter.toString(), '0')
    })

    specify('pass if sigOther is incorrect', async () => {
      const digest = await instanceA.addDebtDigest(instanceB.address, token.address, amount, 0)
      const signatureA = await signature(ALICE, digest)
      const salt = 0x125
      return assert.isRejected(instanceA.addDebt(instanceB.address, token.address, amount, salt, settlementPeriod, signatureA, signatureA))
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
  })

  describe('.collect', () => {
    const amount = 10
    const settlementPeriod = 0

    specify('usual case', async () => {
      await token.approve(instanceA.address, 1000, {from: ALICE})
      await instanceA.deposit(token.address, 10, {from: ALICE})
      const digest = await instanceA.addDebtDigest(instanceB.address, token.address, amount, 0)
      const signatureA = await signature(ALICE, digest)
      const signatureB = await signature(BOB, digest)
      const salt = 0x125
      await instanceA.addDebt(instanceB.address, token.address, amount, salt, settlementPeriod, signatureA, signatureB)
      const collectDigest = await instanceA.collectDigest(token.address)
      const collectSignature = await signature(BOB, collectDigest)

      const balanceBefore = await token.balanceOf(instanceB.address)
      const holdingBefore = await instanceB.balance(token.address)
      const debtIdentifierResult = await instanceA.debtIdentifier.call(instanceB.address, token.address, salt)
      let tx = await instanceA.collectDebt(debtIdentifierResult, collectSignature)
      assert(contracts.Holding.isDidCloseEvent(tx.logs[0]))
      assert(contracts.Holding.isDidCollectEvent(tx.logs[1]))
      const balanceAfter = await token.balanceOf(instanceB.address)

      assert.equal(balanceAfter.sub(balanceBefore).toString(), amount.toString())

      const holdingAfter = await instanceB.balance(token.address)
      assert.equal(holdingAfter.sub(holdingBefore).toString(), amount.toString())
    })
  })

  specify('withdraw', async () => {
    await token.approve(instanceA.address, 1000, {from: ALICE})
    await instanceA.deposit(token.address, 100, {from: ALICE})
    const tokenBalance = await token.balanceOf(instanceA.address)
    assert.equal(tokenBalance.toString(), '100')
    const holdingBalance = await instanceA.balance(token.address)
    assert.equal(holdingBalance.toString(), '100')

    const withdrawal = 10
    const digest = await instanceA.withdrawDigest(BOB, token.address, withdrawal)
    const signatureA = await signature(ALICE, digest)
    const balanceBefore = await token.balanceOf(BOB)
    await instanceA.withdraw(BOB, token.address, withdrawal, signatureA)
    const balanceAfter = await token.balanceOf(BOB)
    assert.equal(balanceAfter.sub(balanceBefore).toString(), withdrawal.toString())
    const holdingBalanceAfter = await instanceA.balance(token.address)
    assert.equal(holdingBalanceAfter.sub(holdingBalance).toString(), (-1 * withdrawal).toString())
  })

  specify('forgive', async () => {
    const amount = 100
    await token.approve(instanceA.address, 1000, {from: ALICE})
    await instanceA.deposit(token.address, amount, {from: ALICE})

    const digestAddDebt = await instanceA.addDebtDigest(instanceB.address, token.address, amount, 0)
    const signatureAAddDebt = await signature(ALICE, digestAddDebt)
    const signatureBAddDebt = await signature(BOB, digestAddDebt)
    const salt = 0x125
    await instanceA.addDebt(instanceB.address, token.address, amount, salt, 0, signatureAAddDebt, signatureBAddDebt)

    const tokenBalance = await token.balanceOf(instanceA.address)
    assert.equal(tokenBalance.toString(), '100')
    const holdingBalance = await instanceA.balance(token.address)
    assert.equal(holdingBalance.toString(), '100')

    const digest = await instanceA.forgiveDigest(instanceB.address, token.address)
    const signatureB = await signature(BOB, digest)
    const debtIdentifierResult = await instanceA.debtIdentifier.call(instanceB.address, token.address, salt)
    await instanceA.forgiveDebt(debtIdentifierResult, signatureB)
    const rawDebt = await instanceA.debts(debtIdentifierResult)
    const debt = Debt.fromContract(rawDebt)
    assert.equal(debt.amount.toString(), '0')
    assert.equal(debt.collectionAfter.toString(), '0')
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
})
