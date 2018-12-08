const HDWalletProvider = require('@machinomy/hdwallet-provider').default
const MNEMONIC = process.env.MNEMONIC
const GAS_LIMIT = 2700000

module.exports = {
  networks: {
    development: {
      network_id: '*',
      host: 'localhost',
      port: 8545,
      gas: GAS_LIMIT
    },
    ropsten: {
      network_id: 3,
      provider: () => HDWalletProvider.http(MNEMONIC, 'https://ropsten.infura.io/'),
      gas: GAS_LIMIT
    },
    kovan: {
      network_id: 42,
      gas: GAS_LIMIT,
      provider: () => HDWalletProvider.http(MNEMONIC, 'https://kovan.infura.io/'),
    },
    mainnet: {
      network_id: 1,
      provider: () => HDWalletProvider.http(MNEMONIC, 'https://mainnet.infura.io/'),
      gasPrice: 20000000000,
      gas: GAS_LIMIT
    },
    rinkeby: {
      host: 'localhost',
      port: 8545,
      network_id: 4,
      from: '0x13d1be93e913d910245a069c67fc4c45a3d0b2fc',
      gas: GAS_LIMIT
    }
  },
  solc: {
    optimizer: {
      enabled: true,
      runs: 200
    }
  }
}
