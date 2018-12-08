pragma solidity ^0.5.0;

import "./vendor/IERC20.sol";
import "./vendor/SafeMath.sol";

contract Holding {
    using SafeMath for uint256;

    mapping (address => uint256) public deposits;

    event DidDeposit(address indexed token, uint256 amount);

    constructor() public {
        // Empty
    }

    function deposit (address _token, uint256 _amount) public {
        IERC20 token = IERC20(_token);
        require(token.transferFrom(msg.sender, address(this), _amount), "Unable to transfer token to the contract");
        deposits[_token] = deposits[_token].add(_amount);
        emit DidDeposit(_token, _amount);
    }
}
