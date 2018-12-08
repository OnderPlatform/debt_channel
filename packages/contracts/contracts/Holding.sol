pragma solidity ^0.5.0;

import "./vendor/IERC20.sol";
import "./vendor/SafeMath.sol";
import "./vendor/Ownable.sol";
import "./vendor/SignerRole.sol";
import "./vendor/ECDSA.sol";

contract Holding is Ownable, SignerRole {
    using SafeMath for uint256;

    mapping (address => uint256) public deposits;
    mapping (address => mapping (address => uint256)) public debts;

    event DidDeposit(address indexed token, uint256 amount);
    event DidAddDebt(address indexed destination, address indexed token, uint256 amount);

    function deposit (address _token, uint256 _amount) public {
        IERC20 token = IERC20(_token);
        require(token.transferFrom(msg.sender, address(this), _amount), "Unable to transfer token to the contract");
        deposits[_token] = deposits[_token].add(_amount);
        emit DidDeposit(_token, _amount);
    }

    function addDebt (address _destination, address _token, uint256 _amount, bytes memory _sigMine, bytes memory _sigOther) public {
        debts[_destination][_token] = debts[_destination][_token].add(_amount);
        bytes32 digest = ECDSA.toEthSignedMessageHash(addDebtDigest(_destination, _token, _amount));
        address recoveredMine = ECDSA.recover(digest, _sigMine);
        require(isSigner(recoveredMine), "Should be signed by me");
        address recoveredOther = ECDSA.recover(digest, _sigOther);
        Holding other = Holding(_destination);
        require(other.isSigner(recoveredOther), "Should be signed by other");
        emit DidAddDebt(_destination, _token, _amount);
    }

    function addDebtDigest (address _destination, address _token, uint256 _amount) public pure returns (bytes32) {
        return keccak256(abi.encode('ad', _destination, _token, _amount));
    }
}
