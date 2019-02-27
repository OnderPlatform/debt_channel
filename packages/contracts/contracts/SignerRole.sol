pragma solidity ^0.5.0;

import "openzeppelin-solidity/contracts/access/Roles.sol";
import "openzeppelin-solidity/contracts/cryptography/ECDSA.sol";
import "./IOwnerRole.sol";


contract SignerRole {
    using Roles for Roles.Role;

    event DidAddSigner(address indexed candidate, address indexed owner);
    event DidRemoveSigner(address indexed candidate, address indexed owner);

    Roles.Role private _signers;

    IOwnerRole parent;

    constructor (IOwnerRole _parent) internal {
        parent = _parent;
        _signers.add(msg.sender);
    }

    function isSigner(address _address) public view returns (bool) {
        return _signers.has(_address);
    }

    function addSignerDigest (address _newSigner) public view returns (bytes32) {
        return keccak256(abi.encode("as", address(this), _newSigner));
    }

    function removeSignerDigest (address _signer) public view returns (bytes32) {
        return keccak256(abi.encode("rs", address(this), _signer));
    }

    function addSigner (address _newSigner, bytes memory _signature) public {
        bytes32 digest = ECDSA.toEthSignedMessageHash(addSignerDigest(_newSigner));
        address owner = ECDSA.recover(digest, _signature);
        require(parent.isOwner(owner), "addSigner: Should be signed by one of owners");
        _signers.add(_newSigner);
        emit DidAddSigner(_newSigner, owner);
    }

    function removeSigner (address _signer, bytes memory _signature) public {
        bytes32 digest = ECDSA.toEthSignedMessageHash(removeSignerDigest(_signer));
        address owner = ECDSA.recover(digest, _signature);
        require(parent.isOwner(owner), "removeSigner: Should be signed by one of owners");
        _signers.remove(_signer);
        emit DidRemoveSigner(_signer, owner);
    }
}
