=============
Debt Channels
=============

Debt Channel is a kind of payment channels between parties with an established identity, where a party promises
to repay at a later date, instead of funding a channel up front.

A payment channel works by exchanging promised payments off-chain. The promise is guaranteed by funds
that are deposited onto the channel smart contract. If anything happens, after some protocol,
a party is free to get her money out of the contract, and out of the channel.
All of the possible cases for getting the funds are set in the smart contract.

For debt channel, there is a recourse to a real, flesh world, so instead of doing promised
payments a party may promise a debt to be repaid at a later date, and send it off-chain.

~~~~~~~~~~~~~~~~~~~~
Currently supported:
~~~~~~~~~~~~~~~~~~~~

* Unidirectional ERC-20 channels
* Clearing of channels against each other
* Forgiving a debt

~~~~~~~~~~~~~~~~~
To be done later:
~~~~~~~~~~~~~~~~~

* ERC-20 notification on transfer
* Cloaking of the transfers using zero-knowledge proofs
* Contract Interface according to `ERC 165`_
* Link with Identity: `EIP 1484`_, `EIP 725`_
* Meta transactions: `EIP 1077`_
* Check signer: `EIP 1271`_
* Rebalancing: possibly through the same mechanism as clearing
* Smart contracts over debts
* Token exchange
* Owners in separate contract, like gnosis Safe.
* Interest rates
* Tokenising debt
* Debt Interface through `EIP 1532`_
* Streamed payments: `EIP 948`_, `EIP 1337`_

.. _`EIP 1532`: https://github.com/ethereum/EIPs/pull/1532
.. _`ERC 165`: https://eips.ethereum.org/EIPS/eip-165
.. _`EIP 1484`: https://eips.ethereum.org/EIPS/eip-1484
.. _`EIP 725`: https://eips.ethereum.org/EIPS/eip-725
.. _`EIP 1077`: https://eips.ethereum.org/EIPS/eip-1077
.. _`EIP 1271`: https://eips.ethereum.org/EIPS/eip-1271
.. _`EIP 948`: https://github.com/ethereum/EIPs/issues/948
.. _`EIP 1337`: https://github.com/ethereum/EIPs/issues/1337


====================
 Contents
====================

.. toctree::
   :maxdepth: 3

   overview
   holding_design
   clearinghouse_design
