import * as Web3 from 'web3'
import * as chai from 'chai'
import * as BigNumber from 'bignumber.js'
import * as asPromised from 'chai-as-promised'
import * as contracts from './'
import * as sigUtil from 'eth-sig-util'
import TestToken from './wrappers/TestToken'

chai.use(asPromised)

const web3 = (global as any).web3 as Web3
const assert = chai.assert

const Holding = artifacts.require<contracts.Holding.Contract>('Holding.sol')
const Token = artifacts.require<TestToken.Contract>('support/TestToken.sol')

const WRONG_CHANNEL_ID = '0xdeadbeaf'
const WRONG_SIGNATURE = '0xcafebabe'

contract('Holding', accounts => {
  const sender = accounts[0]

  let instance: contracts.Holding.Contract
  let token: TestToken.Contract

  beforeEach(async () => {
    token = await Token.new()
    await token.mint(sender, 1000)
    instance = await Holding.new()
  })

  describe('constructor', () => {
    specify('set owner', async () => {
      const holding = await Holding.new({from: sender})
      const owner = await holding.owner()
      assert.equal(owner, sender)
    })
  })

  describe('.deposit', () => {
    specify('emit DidOpen event', async () => {
      await token.approve(instance.address, 1000, {from: sender})
      await instance.deposit(token.address, 100, {from: sender})
      const tokenBalance = await token.balanceOf(instance.address)
      assert.equal(tokenBalance.toString(), '100')
      const holdingBalance = await instance.deposits(token.address)
      assert(holdingBalance.toString(), '100')
    })
  })
})
