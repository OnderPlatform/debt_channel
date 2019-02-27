import * as Web3 from 'web3'
import * as chai from 'chai'
import * as asPromised from 'chai-as-promised'
import * as contracts from './'
import * as util from 'ethereumjs-util'
import TestToken from './wrappers/TestToken'

chai.use(asPromised)

const web3 = (global as any).web3 as Web3
const assert = chai.assert

const ClearingHouse = artifacts.require<contracts.ClearingHouse.Contract>('ClearingHouse.sol')
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

contract('ClearingHouse', accounts => {
  const ALICE = accounts[0]
  const BOB = accounts[1]
  const ALICE_DELEGATE = accounts[2]
  const BOB_DELEGATE = accounts[3]

  const idA = '0x0000000000000000000000000000000000000000000000000000000000000001'
  const idB = '0x0000000000000000000000000000000000000000000000000000000000000002'

  let instanceA: contracts.Holding.Contract
  let instanceB: contracts.Holding.Contract
  let clearingHouse: contracts.ClearingHouse.Contract
  let token: TestToken.Contract

  beforeEach(async () => {
    token = await Token.new()
    await token.mint(ALICE, 1000)
    await token.mint(BOB, 1000)
    clearingHouse = await ClearingHouse.new()
    instanceA = await Holding.new(3, clearingHouse.address, { from: ALICE })
    instanceB = await Holding.new(3, clearingHouse.address, { from: BOB })

    const aliceDelegateSignature = await signature(ALICE, await instanceA.addSignerDigest(ALICE_DELEGATE))
    await instanceA.addSigner(ALICE_DELEGATE, aliceDelegateSignature)

    const bobDelegateSignature = await signature(BOB, await instanceB.addSignerDigest(BOB_DELEGATE))
    await instanceB.addSigner(BOB_DELEGATE, bobDelegateSignature)
  })

  describe('.clear', () => {
    specify('happy case', async () => {
      const digest = await clearingHouse.clearDigest(instanceA.address, instanceB.address, idA, idB)
      const signatureA = await signature(ALICE, digest)
      const signatureB = await signature(BOB, digest)
      const tx = await clearingHouse.clear(instanceA.address, instanceB.address, idA, idB, signatureA, signatureB)
      const isCleared = await clearingHouse.isCleared(instanceA.address, idA)
      assert(isCleared)

      assert(contracts.ClearingHouse.isDidClearEvent(tx.logs[0]))
      assert(contracts.ClearingHouse.isDidClearEvent(tx.logs[1]))
      assert.equal(tx.logs[0].args.holding, instanceA.address)
      assert.equal(tx.logs[0].args.debtId, idA)
      assert.equal(tx.logs[1].args.holding, instanceB.address)
      assert.equal(tx.logs[1].args.debtId, idB)
    })

    specify('happy delegate case', async () => {
      const digest = await clearingHouse.clearDigest(instanceA.address, instanceB.address, idA, idB)
      const signatureA = await signature(ALICE_DELEGATE, digest)
      const signatureB = await signature(BOB_DELEGATE, digest)
      const tx = await clearingHouse.clear(instanceA.address, instanceB.address, idA, idB, signatureA, signatureB)
      const isCleared = await clearingHouse.isCleared(instanceA.address, idA)
      assert(isCleared)

      assert(contracts.ClearingHouse.isDidClearEvent(tx.logs[0]))
      assert(contracts.ClearingHouse.isDidClearEvent(tx.logs[1]))
      assert.equal(tx.logs[0].args.holding, instanceA.address)
      assert.equal(tx.logs[0].args.debtId, idA)
      assert.equal(tx.logs[1].args.holding, instanceB.address)
      assert.equal(tx.logs[1].args.debtId, idB)
    })

    specify('fail if wrong A signature', async () => {
      const digest = await clearingHouse.clearDigest(instanceA.address, instanceB.address, idA, idB)
      const signatureB = await signature(BOB, digest)
      return assert.isRejected(clearingHouse.clear(instanceA.address, instanceB.address, idA, idB, '0xdead', signatureB))
    })

    specify('fail if wrong B signature', async () => {
      const digest = await clearingHouse.clearDigest(instanceA.address, instanceB.address, idA, idB)
      const signatureA = await signature(ALICE, digest)
      return assert.isRejected(clearingHouse.clear(instanceA.address, instanceB.address, idA, idB, signatureA, '0xdead'))
    })
  })

  describe('.forgive', () => {
    specify('happy case', async () => {
      const amount = 100
      const nonce = 0x125

      await token.approve(instanceA.address, amount, { from: ALICE })
      await instanceA.deposit(token.address, amount, { from: ALICE })

      const digestAddDebt = await instanceA.addDebtDigest(instanceB.address, token.address, amount, 0)
      const signatureAAddDebt = await signature(ALICE, digestAddDebt)
      const signatureBAddDebt = await signature(BOB, digestAddDebt)
      await instanceA.addDebt(instanceB.address, token.address, amount, nonce, 0, signatureAAddDebt, signatureBAddDebt)

      const debtId = await instanceA.debtIdentifier(instanceB.address, token.address, nonce)

      const digest = await instanceA.forgiveDigest(debtId)
      const signatureB = await signature(BOB, digest)
      const tx = await instanceA.forgiveDebt(debtId, signatureB)
      assert(contracts.ClearingHouse.isDidForgiveEvent(tx.logs[0]))
      assert.equal(tx.logs[0].args.destination, instanceA.address)
      assert.equal(tx.logs[0].args.debtId, debtId)

      const rawDebt = await instanceA.debts(debtId)
      const debt = contracts.Debt.fromContract(rawDebt)
      assert.equal(debt.amount.toNumber(), 0)
      assert.equal(debt.collectionAfter.toNumber(), 0)

      const isCleared = await clearingHouse.isCleared(instanceA.address, debtId)

      assert(isCleared)
    })

    specify('not if not from holding', async () => {
      return assert.isRejected(clearingHouse.forgive(idA))
    })
  })
})
