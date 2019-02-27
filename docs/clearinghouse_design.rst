===============================
 ClearingHouse Contract Design
===============================

A debt in our system could only grow. In real life though, we see bidirectional flow of funds, and bidirectional
flow of debts. This means, at some time, we would like to clear debt channels against each other.
For this, we introduce *ClearingHouse* contract.

It tracks clearing information:

.. code-block:: solidity

  mapping (address => mapping (bytes32 => bool)) public cleared

Here the first `address` key is address of debt contract, `bytes32` is debt identifier.
`bool` value indicates whether the debt is cleared.

This supports following functions:

.. code-block:: solidity

  clear(address _partyA, address _partyB, bytes32 _idA, bytes32 _idB, bytes memory _sigA, bytes memory _sigB) public

Adds entry to the cleared list for `_partyA` and `_partyB`. Check if signature corresponds to both of the parties' command.
Check if both contracts use the same clearing house.

.. code-block:: solidity

  isCleared(address _party, bytes32 _id)

Returns true if the debt is cleared.

.. code-block:: solidity

  forgive(bytes32 _id) public

Clear the debt identified by `_id` on holding contract with address `msg.sender`.
Thus, the call could only go from the holding contract.
