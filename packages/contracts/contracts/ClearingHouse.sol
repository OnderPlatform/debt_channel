pragma solidity ^0.5.0;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "openzeppelin-solidity/contracts/cryptography/ECDSA.sol";
import "./vendor/SignerRole.sol";
import "./Holding.sol";


/// @title Clearing House
contract ClearingHouse {
    using SafeMath for uint256;

    mapping (address => mapping (bytes32 => bool)) public cleared;

    event DidForgive(address indexed holding, bytes32 indexed debtId);
    event DidClear(address indexed holding, bytes32 indexed debtId);

    function clear (
        address payable _partyA,
        address payable _partyB,
        bytes32 _idA,
        bytes32 _idB,
        bytes memory _sigA,
        bytes memory _sigB) public
    {
        SignerRole holdingA = SignerRole(_partyA);
        bytes32 digestA = ECDSA.toEthSignedMessageHash(clearDigest(_partyA, _partyB, _idA, _idB));
        address recoveredA = ECDSA.recover(digestA, _sigA);
        require(holdingA.isSigner(recoveredA), "00_WRONG_SIGNATURE_A");

        SignerRole holdingB = SignerRole(_partyB);
        bytes32 digestB = ECDSA.toEthSignedMessageHash(clearDigest(_partyA, _partyB, _idA, _idB));
        address recoveredB = ECDSA.recover(digestB, _sigB);
        require(holdingB.isSigner(recoveredB), "01_WRONG_SIGNATURE_B");

        cleared[_partyA][_idA] = true;
        cleared[_partyB][_idB] = true;
        emit DidClear(_partyA, _idA);
        emit DidClear(_partyB, _idB);
    }

    function isCleared (address _party, bytes32 _id) public view returns (bool) {
        return cleared[_party][_id];
    }

    function forgive (bytes32 _debtId) public returns (bool) {
        Holding holding = Holding(msg.sender);
        require(address(holding.clearingHouse()) == address(this), "00_EXPECT_FROM_HOLDING");
        cleared[msg.sender][_debtId] = true;
        emit DidForgive(msg.sender, _debtId);
        return true;
    }

    function clearDigest (address _partyA, address _partyB, bytes32 _idA, bytes32 _idB) public view returns (bytes32) {
        return keccak256(abi.encode("cl", address(this), _partyA, _partyB, _idA, _idB));
    }
}
