pragma solidity ^0.5.0;

import "openzeppelin-solidity/contracts/access/Roles.sol";
import "openzeppelin-solidity/contracts/cryptography/ECDSA.sol";
import "./IOwnerRole.sol";


/**
 * @title Ownable
 */
contract OwnerRole is IOwnerRole {
    using Roles for Roles.Role;

    Roles.Role private _owners;

    event DidAddOwner(address indexed candidate, address indexed owner);
    event DidRemoveOwner(address indexed candidate, address indexed owner);

    constructor () internal {
        _owners.add(msg.sender);
    }

    function addOwnerDigest (address _newOwner) public view returns (bytes32) {
        return keccak256(abi.encode("ao", address(this), _newOwner));
    }

    function removeOwnerDigest (address _owner) public view returns (bytes32) {
        return keccak256(abi.encode("ro", address(this), _owner));
    }

    function isOwner (address _address) public view returns (bool) {
        return _owners.has(_address);
    }

    function addOwner (address _candidate, bytes memory _signature) public {
        bytes32 digest = ECDSA.toEthSignedMessageHash(addOwnerDigest(_candidate));
        address owner = ECDSA.recover(digest, _signature);
        require(isOwner(owner), "addOwner: Should be signed by one of owners");
        _owners.add(_candidate);
        emit DidAddOwner(_candidate, owner);
    }

    function removeOwner (address _candidate, bytes memory _signature) public {
        bytes32 digest = ECDSA.toEthSignedMessageHash(removeOwnerDigest(_candidate));
        address owner = ECDSA.recover(digest, _signature);
        require(isOwner(owner), "removeOwner: Should be signed by one of owners");
        _owners.remove(_candidate);
        emit DidRemoveOwner(_candidate, owner);
    }
}
