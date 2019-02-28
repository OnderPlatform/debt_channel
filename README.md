# Debt Channels

> L2 payment channels among parties with established identity. Built on Ethereum.

[![Build Status](https://img.shields.io/circleci/project/github/OnderPlatform/debt_channel/master.svg)](https://circleci.com/gh/OnderPlatform/debt_channel)
[![Coverage Status](https://img.shields.io/coveralls/github/OnderPlatform/debt_channel/master.svg)](https://coveralls.io/github/OnderPlatform/debt_channel?branch=master)
[![Documentation Status](https://readthedocs.com/projects/onder-debt-channels/badge/?version=latest)](http://debt-channels.onder.tech)

Debt Channel is a kind of payment channels between parties with an established identity, where a party promises
to repay at a later date, instead of funding a channel up front.

A payment channel works by exchanging promised payments off-chain. The promise is guaranteed by funds
that are deposited onto the channel smart contract. If anything happens, after some protocol,
a party is free to get her money out of the contract, and out of the channel.
All of the possible cases for getting the funds are set in the smart contract.

For debt channel, there is a recourse to a real, flesh world, so instead of doing promised
payments a party may promise a debt to be repaid at a later date, and send it off-chain.

The package contains smart contracts for Debt Channels.

Documentation can be found on [Read The Docs](http://debt-channels.onder.tech).

## Installation

```
yarn bootstrap
```

## Testing
```
yarn test
```

## Code Coverage
```
yarn coverage
```


## Contributing

1. Fork it (<https://github.com/onderPlatform/debt_channel/fork>)
2. Create your feature branch (`git checkout -b feature/awesome`)
3. Commit your changes (`git commit -am 'Add some awesome feature'`)
4. Push to the branch (`git push origin feature/awesome`)
5. Create a new Pull Request

## License

This project is licensed under the AGPL-3.0 License - see the [LICENSE.txt](LICENSE.txt) file for details.
