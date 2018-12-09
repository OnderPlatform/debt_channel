pragma solidity ^0.5.0;

import "./vendor/IERC20.sol";
import "./vendor/SafeMath.sol";
import "./vendor/Ownable.sol";
import "./vendor/SignerRole.sol";
import "./vendor/ECDSA.sol";

contract Holding is Ownable, SignerRole {
    using SafeMath for uint256;

    struct Debt {
        uint256 collectionAfter;
        uint256 amount;
    }

    mapping (address => uint256) public deposits;
    mapping (address => mapping (address => Debt)) public debts;

    event DidDeposit(address indexed token, uint256 amount);
    event DidAddDebt(address indexed destination, address indexed token, uint256 amount);
    event DidCollect(address indexed destination, address indexed token, uint256 amount);
    event DidClose(address indexed destination, address indexed token, uint256 amount);
    event DidWithdraw(address indexed destination, address indexed token, uint256 amount);

    function deposit (address _token, uint256 _amount) public {
        IERC20 token = IERC20(_token);
        require(token.transferFrom(msg.sender, address(this), _amount), "Unable to transfer token to the contract");
        deposits[_token] = deposits[_token].add(_amount);
        emit DidDeposit(_token, _amount);
    }

    function withdraw (address _destination, address _token, uint256 _amount, bytes memory _signature) public {
        IERC20 token = IERC20(_token);
        bytes32 digest = ECDSA.toEthSignedMessageHash(withdrawDigest(_destination, _token, _amount));
        address recovered = ECDSA.recover(digest, _signature);
        require(isSigner(recovered), "Should be signed");
        require(token.transfer(_destination, _amount), "Can not transfer token");
        deposits[_token] = deposits[_token].sub(_amount);
        emit DidWithdraw(_destination, _token, _amount);
    }

    function collect (address _destination, address _token, bytes memory _signature) public {
        Holding other = Holding(_destination);
        bytes32 digest = ECDSA.toEthSignedMessageHash(collectDigest(_token));
        address recoveredOther = ECDSA.recover(digest, _signature);
        require(other.isSigner(recoveredOther), "Should be signed by other");

        Debt memory debt = debts[_destination][_token];
        IERC20 token = IERC20(_token);
        uint256 amountToSend;
        if (debt.amount > deposits[_token]) {
            amountToSend = deposits[_token];
        } else {
            amountToSend = debt.amount;
            emit DidClose(_destination, _token, amountToSend);
        }

        debt.amount = debt.amount.sub(amountToSend);
        deposits[_token] = deposits[_token].sub(amountToSend);
        emit DidCollect(_destination, _token, deposits[_token]);

        require(token.approve(_destination, amountToSend), "Can not approve token transfer");
        other.deposit(_token, amountToSend);
    }

    function addDebt (
        address _destination,
        address _token,
        uint256 _amount,
        uint256 _settlementPeriod,
        bytes memory _sigMine,
        bytes memory _sigOther
    ) public {
        bytes32 digest = ECDSA.toEthSignedMessageHash(addDebtDigest(_destination, _token, _amount));
        address recoveredMine = ECDSA.recover(digest, _sigMine);
        require(isSigner(recoveredMine), "Should be signed by me");

        address recoveredOther = ECDSA.recover(digest, _sigOther);
        Holding other = Holding(_destination);
        require(other.isSigner(recoveredOther), "Should be signed by other");

        require(debts[_destination][_token].collectionAfter == 0, "Can not override existing");

        debts[_destination][_token] = Debt({
            amount: _amount,
            collectionAfter: now + _settlementPeriod
        });

        emit DidAddDebt(_destination, _token, _amount);
    }

    function collectDigest (address _token) public pure returns (bytes32) {
        return keccak256(abi.encode("co", _token));
    }

    function withdrawDigest (address _destination, address _token, uint256 _amount) public pure returns (bytes32) {
        return keccak256(abi.encode("wi", _destination, _token, _amount));
    }

    function addDebtDigest (
        address _destination,
        address _token,
        uint256 _amount
    ) public pure returns (bytes32) {
        return keccak256(abi.encode("ad", _destination, _token, _amount));
    }
}
