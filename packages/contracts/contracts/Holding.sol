pragma solidity ^0.5.0;

import "./vendor/IERC20.sol";
import "./vendor/SafeMath.sol";
import "./vendor/Ownable.sol";
import "./vendor/SignerRole.sol";
import "./vendor/ECDSA.sol";

contract Holding is Ownable, SignerRole {
    using SafeMath for uint256;

    struct Debt {
        uint32 nonce;
        uint256 collectionAfter;
        uint256 amount;
    }

    mapping (address => uint256) public deposits;
    mapping (address => mapping (address => Debt)) public debts;

    event DidDeposit(address indexed token, uint256 amount);
    event DidAddDebt(address indexed destination, address indexed token, uint256 amount);

    function deposit (address _token, uint256 _amount) public {
        IERC20 token = IERC20(_token);
        require(token.transferFrom(msg.sender, address(this), _amount), "Unable to transfer token to the contract");
        deposits[_token] = deposits[_token].add(_amount);
        emit DidDeposit(_token, _amount);
    }

    function addDebt (
        address _destination,
        address _token,
        uint256 _amount,
        uint32 _nonce,
        uint256 _collectionAfter,
        bytes memory _sigMine,
        bytes memory _sigOther
    ) public {
        bytes32 digest = ECDSA.toEthSignedMessageHash(addDebtDigest(_destination, _token, _amount, _nonce, _collectionAfter));
        address recoveredMine = ECDSA.recover(digest, _sigMine);
        require(isSigner(recoveredMine), "Should be signed by me");

        address recoveredOther = ECDSA.recover(digest, _sigOther);
        Holding other = Holding(_destination);
        require(other.isSigner(recoveredOther), "Should be signed by other");

        require(canAddDebt(_destination, _token, _nonce), "Can not override existing");

        debts[_destination][_token] = Debt({
            nonce: _nonce,
            amount: _amount,
            collectionAfter: _collectionAfter
        });

        emit DidAddDebt(_destination, _token, _amount);
    }

    function addDebtDigest (
        address _destination,
        address _token,
        uint256 _amount,
        uint32 _nonce,
        uint256 _collectionAfter
    ) public pure returns (bytes32) {
        return keccak256(abi.encode('ad', _destination, _token, _amount, _nonce, _collectionAfter));
    }

    function canAddDebt (address _destination, address _token, uint32 _nonce) public view returns (bool) {
        Debt memory current = debts[_destination][_token];
        if (current.nonce == 0) {
            return true;
        } else {
            return _nonce > current.nonce && now < current.collectionAfter;
        }
    }
}
