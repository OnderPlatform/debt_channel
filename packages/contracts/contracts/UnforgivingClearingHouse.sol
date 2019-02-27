pragma solidity ^0.5.0;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "openzeppelin-solidity/contracts/cryptography/ECDSA.sol";
import "./SignerRole.sol";
import "./ClearingHouse.sol";


/// @title Clearing House
contract UnforgivingClearingHouse is ClearingHouse {
    function forgive (bytes32 _debtId) public returns (bool) {
        return false;
    }
}
