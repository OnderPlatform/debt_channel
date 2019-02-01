pragma solidity ^0.5.0;

import "./vendor/IERC20.sol";
import "./vendor/SafeMath.sol";
import "./vendor/Ownable.sol";
import "./vendor/SignerRole.sol";
import "./vendor/ECDSA.sol";

/// @title Holding
contract Holding is Ownable, SignerRole  {
    using SafeMath for uint256;

    enum State {
        Active,     // Usual case, all operations are permitted
        Retired    // End of life of contract state, contract will terminated soon.
    }

    struct Debt {
        address destination;     // Receiver address of debt
        address token;           // Currency of debt
        uint256 collectionAfter; //
        uint256 amount;          // Amount of debt
        uint16  salt;            // ID of debt
    }

    State public _currentState;
    address public _owner;
    uint256 public _retiringPeriod;
    uint256 public _retiringUntil;
    address public _clearingHouse;
    bool public _halt;


    mapping (bytes32 => Debt) public debts;
    // mapping (address of token contract) => (balance)
    mapping (address => uint256) public balance;
    mapping (address => bool) public owners;

    event DidDeposit(address indexed token, uint256 amount);
    event DidAddDebt(address indexed destination, address indexed token, uint256 amount);
    event DidCollect(address indexed destination, address indexed token, uint256 amount);
    event DidClose(address indexed destination, address indexed token, uint256 amount);
    event DidWithdraw(address indexed destination, address indexed token, uint256 amount);
    event DidForgive(address indexed destination, address indexed token, uint256 amount);
    event DidRetired();

    /*** ACTIONS AND CONSTRAINTS ***/

    /// @notice Constructs the new "Holding" contract.
    /// @param owner Address of holding's owner.
    /// @param retiringPeriod How many time Holding resides in Retire state since retire() method called.
    /// @param clearingHouse Address of contract that available to clear debts.
    constructor (address owner, uint256 retiringPeriod, address clearingHouse) public {
        _owner = owner;
        _retiringPeriod = retiringPeriod;
        _clearingHouse = clearingHouse;
        _halt = false;
        _currentState = State.Active;
    }

    /// @notice Get current contract lifecycle stage.
    /// @return { State.Active OR State.Retire OR State.Dismissed
    function currentState () public returns (State) {
        return _currentState;
    }

    /// @notice Prepare contract for termination. Starts a retiring period.
    /// After retiring period no new debts could be added. One could only repay the existing debts.
    /// @param _signature Signature on
    function retire (bytes memory _signature) public {
        require(_currentState == State.Active, "Must be in Active state.");
        bytes32 digest = ECDSA.toEthSignedMessageHash(retireDigest(address(this)));
        address recovered = ECDSA.recover(digest, _signature);
        require(isSigner(recovered), "Should be signed ");

        _retiringUntil = block.timestamp + _retiringPeriod;
        _currentState = State.Retired;

        emit DidRetired();
    }

    /// @notice Prepare contract for termination. Starts a retiring period.
    //  After retiring period no new debts could be added. One could only repay the existing debts.
    function stop() public {
        require(_currentState == State.Retired, "Must be in Retired state.");
        require(block.timestamp > _retiringUntil, "Retiring period still proceed.");
//        require(balance)
        // debts are cleared
        // balance is null

        selfdestruct(address(msg.sender));
    }

    function deposit (address _token, uint256 _amount) public {
        IERC20 token = IERC20(_token);
        require(token.transferFrom(msg.sender, address(this), _amount), "Unable to transfer token to the contract");
        balance[_token] = balance[_token].add(_amount);
        emit DidDeposit(_token, _amount);
    }

    function withdraw (address _destination, address _token, uint256 _amount, bytes memory _signature) public {
        IERC20 token = IERC20(_token);
        bytes32 digest = ECDSA.toEthSignedMessageHash(withdrawDigest(_destination, _token, _amount));
        address recovered = ECDSA.recover(digest, _signature);
        require(isSigner(recovered), "Should be signed");
        require(token.transfer(_destination, _amount), "Can not transfer token");
        balance[_token] = balance[_token].sub(_amount);
        emit DidWithdraw(_destination, _token, _amount);
    }

    function collectDebt (bytes32 _id, bytes memory _signature) public {
        Debt memory debt = debts[_id];
        address destination = debt.destination;
        address tokenContract = debt.token;
        Holding other = Holding(address(destination));

        bytes32 digest = ECDSA.toEthSignedMessageHash(collectDigest(tokenContract));
        address recoveredOther = ECDSA.recover(digest, _signature);
        require(other.isSigner(recoveredOther), "Should be signed by other");

        require(debt.collectionAfter >= block.timestamp, "Can only collect existing stuff");
        IERC20 token = IERC20(tokenContract);
        uint256 amountToSend;
        if (debt.amount > balance[tokenContract]) {
            amountToSend = balance[tokenContract];
        } else {
            amountToSend = debt.amount;
            emit DidClose(destination, tokenContract, amountToSend);
        }

        debt.amount = debt.amount.sub(amountToSend);
        balance[tokenContract] = balance[tokenContract].sub(amountToSend);
        emit DidCollect(destination, tokenContract, balance[tokenContract]);

        require(token.approve(destination, amountToSend), "Can not approve token transfer");
        other.deposit(tokenContract, amountToSend);
    }

    function addDebt (
        address _destination,
        address _token,
        uint256 _amount,
        uint16 _salt,
        uint256 _settlementPeriod,
        bytes memory _sigOwner,
        bytes memory _sigCreditor
    ) public {
        require(block.timestamp < _retiringUntil, "Contract in dismissed state. Can not add new debt.");
        bytes32 digest = ECDSA.toEthSignedMessageHash(addDebtDigest(_destination, _token, _amount));
        address recoveredOwner = ECDSA.recover(digest, _sigOwner);
        require(isSigner(recoveredOwner), "Should be signed by owner");

        address recoveredCreditor = ECDSA.recover(digest, _sigCreditor);
        Holding creditor = Holding(_destination);
        require(creditor.isSigner(recoveredCreditor), "Should be signed by creditor");

        bytes32 debtID = debtIdentifier(_destination, _token, _salt);

        require(debts[debtID].collectionAfter == 0, "Can not override existing");

        debts[debtID] = Debt({
            destination: _destination,
            token: _token,
            amount: _amount,
            collectionAfter: block.timestamp + _settlementPeriod,
            salt: _salt
        });

        emit DidAddDebt(_destination, _token, _amount);
    }

    function forgiveDebt (bytes32 _id, bytes _signature) public {
        Debt memory debt = debts[_id];
        address destination = debt.destination;
        address tokenContract = debt.token;
        Holding other = Holding(destination);
        bytes32 digest = ECDSA.toEthSignedMessageHash(forgiveDigest(destination, tokenContract));
        address recoveredOther = ECDSA.recover(digest, _signature);
        require(other.isSigner(recoveredOther), "Should be signed by other");

        emit DidForgive(destination, tokenContract, debts[_id].amount);

        delete debts[_id];
    }
    function forgive (
        address _destination,
        address _token,
        bytes memory _sigMine,
        bytes memory _sigOther
    ) public {

    }

    function forgiveDigest (address _destination, address _token) public pure returns (bytes32) {
        return keccak256(abi.encode("fo", _destination, _token));
    }

    function collectDigest (address _token) public pure returns (bytes32) {
        return keccak256(abi.encode("co", _token));
    }

    function withdrawDigest (address _destination, address _token, uint256 _amount) public pure returns (bytes32) {
        return keccak256(abi.encode("wi", _destination, _token, _amount));
    }

    function retireDigest (address contractAddress) public pure returns (bytes32) {
        return keccak256(abi.encode("re", contractAddress));
    }

    function addDebtDigest (
        address _destination,
        address _token,
        uint256 _amount
    ) public pure returns (bytes32) {
        return keccak256(abi.encode("ad", _destination, _token, _amount));
    }

    function debtIdentifier (address _destination, address _token, uint16 _salt) public returns (bytes32) {
        return keccak256(address(this), _destination, _token, _salt);
    }
}
