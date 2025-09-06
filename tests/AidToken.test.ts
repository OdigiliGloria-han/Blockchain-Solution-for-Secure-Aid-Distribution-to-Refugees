
// AidToken.test.ts
import { describe, expect, it, beforeEach } from "vitest";

// Interfaces for type safety
interface ClarityResponse<T> {
  ok: boolean;
  value: T | number; // number for error codes
}

interface ContractState {
  balances: Map<string, number>;
  admins: Map<string, boolean>;
  blacklisted: Map<string, boolean>;
  totalSupply: number;
  paused: boolean;
  owner: string;
  name: string;
  symbol: string;
  decimals: number;
  uri?: string;
}

// Mock contract implementation
class AidTokenMock {
  private state: ContractState = {
    balances: new Map(),
    admins: new Map(),
    blacklisted: new Map(),
    totalSupply: 0,
    paused: false,
    owner: "deployer",
    name: "AidToken",
    symbol: "AID",
    decimals: 6,
  };

  private ERR_NOT_AUTHORIZED = 200;
  private ERR_PAUSED = 201;
  private ERR_INVALID_AMOUNT = 202;
  private ERR_BLACKLISTED = 203;
  private ERR_MAX_SUPPLY = 204;
  private MAX_SUPPLY = 1000000000000;

  private isAdmin(caller: string): boolean {
    return caller === this.state.owner || (this.state.admins.get(caller) ?? false);
  }

  setPaused(caller: string, paused: boolean): ClarityResponse<boolean> {
    if (caller !== this.state.owner) return { ok: false, value: this.ERR_NOT_AUTHORIZED };
    this.state.paused = paused;
    return { ok: true, value: true };
  }

  addAdmin(caller: string, newAdmin: string): ClarityResponse<boolean> {
    if (caller !== this.state.owner) return { ok: false, value: this.ERR_NOT_AUTHORIZED };
    this.state.admins.set(newAdmin, true);
    return { ok: true, value: true };
  }

  removeAdmin(caller: string, admin: string): ClarityResponse<boolean> {
    if (caller !== this.state.owner) return { ok: false, value: this.ERR_NOT_AUTHORIZED };
    this.state.admins.set(admin, false);
    return { ok: true, value: true };
  }

  blacklist(caller: string, account: string, blacklist: boolean): ClarityResponse<boolean> {
    if (!this.isAdmin(caller)) return { ok: false, value: this.ERR_NOT_AUTHORIZED };
    this.state.blacklisted.set(account, blacklist);
    return { ok: true, value: true };
  }

  transfer(caller: string, amount: number, sender: string, recipient: string): ClarityResponse<boolean> {
    if (this.state.paused) return { ok: false, value: this.ERR_PAUSED };
    if (caller !== sender) return { ok: false, value: this.ERR_NOT_AUTHORIZED };
    if (amount <= 0) return { ok: false, value: this.ERR_INVALID_AMOUNT };
    if (this.state.blacklisted.get(sender) ?? false) return { ok: false, value: this.ERR_BLACKLISTED };
    if (this.state.blacklisted.get(recipient) ?? false) return { ok: false, value: this.ERR_BLACKLISTED };
    const senderBal = this.state.balances.get(sender) ?? 0;
    if (senderBal < amount) return { ok: false, value: this.ERR_INVALID_AMOUNT };
    this.state.balances.set(sender, senderBal - amount);
    const recipBal = this.state.balances.get(recipient) ?? 0;
    this.state.balances.set(recipient, recipBal + amount);
    return { ok: true, value: true };
  }

  mint(caller: string, amount: number, recipient: string): ClarityResponse<boolean> {
    if (this.state.paused) return { ok: false, value: this.ERR_PAUSED };
    if (!this.isAdmin(caller)) return { ok: false, value: this.ERR_NOT_AUTHORIZED };
    if (amount <= 0) return { ok: false, value: this.ERR_INVALID_AMOUNT };
    if (this.state.totalSupply + amount > this.MAX_SUPPLY) return { ok: false, value: this.ERR_MAX_SUPPLY };
    if (this.state.blacklisted.get(recipient) ?? false) return { ok: false, value: this.ERR_BLACKLISTED };
    const bal = this.state.balances.get(recipient) ?? 0;
    this.state.balances.set(recipient, bal + amount);
    this.state.totalSupply += amount;
    return { ok: true, value: true };
  }

  burn(caller: string, amount: number, sender: string): ClarityResponse<boolean> {
    if (this.state.paused) return { ok: false, value: this.ERR_PAUSED };
    if (caller !== sender) return { ok: false, value: this.ERR_NOT_AUTHORIZED };
    if (amount <= 0) return { ok: false, value: this.ERR_INVALID_AMOUNT };
    const bal = this.state.balances.get(sender) ?? 0;
    if (bal < amount) return { ok: false, value: this.ERR_INVALID_AMOUNT };
    this.state.balances.set(sender, bal - amount);
    this.state.totalSupply -= amount;
    return { ok: true, value: true };
  }

  getName(): ClarityResponse<string> {
    return { ok: true, value: this.state.name };
  }

  getSymbol(): ClarityResponse<string> {
    return { ok: true, value: this.state.symbol };
  }

  getDecimals(): ClarityResponse<number> {
    return { ok: true, value: this.state.decimals };
  }

  getBalance(account: string): ClarityResponse<number> {
    return { ok: true, value: this.state.balances.get(account) ?? 0 };
  }

  getTotalSupply(): ClarityResponse<number> {
    return { ok: true, value: this.state.totalSupply };
  }

  isBlacklisted(account: string): ClarityResponse<boolean> {
    return { ok: true, value: this.state.blacklisted.get(account) ?? false };
  }
}

// Test setup
const accounts = {
  deployer: "deployer",
  admin: "wallet_1",
  user1: "wallet_2",
  user2: "wallet_3",
};

describe("AidToken Contract", () => {
  let contract: AidTokenMock;

  beforeEach(() => {
    contract = new AidTokenMock();
  });

  it("should initialize with correct metadata", () => {
    expect(contract.getName()).toEqual({ ok: true, value: "AidToken" });
    expect(contract.getSymbol()).toEqual({ ok: true, value: "AID" });
    expect(contract.getDecimals()).toEqual({ ok: true, value: 6 });
    expect(contract.getTotalSupply()).toEqual({ ok: true, value: 0 });
  });

  it("should allow admin to mint tokens", () => {
    const mint = contract.mint(accounts.deployer, 1000, accounts.user1);
    expect(mint).toEqual({ ok: true, value: true });
    expect(contract.getBalance(accounts.user1)).toEqual({ ok: true, value: 1000 });
    expect(contract.getTotalSupply()).toEqual({ ok: true, value: 1000 });
  });

  it("should prevent non-admin from minting", () => {
    const mint = contract.mint(accounts.user1, 1000, accounts.user1);
    expect(mint).toEqual({ ok: false, value: 200 });
  });

  it("should allow transfer between users", () => {
    contract.mint(accounts.deployer, 1000, accounts.user1);
    const transfer = contract.transfer(accounts.user1, 500, accounts.user1, accounts.user2);
    expect(transfer).toEqual({ ok: true, value: true });
    expect(contract.getBalance(accounts.user1)).toEqual({ ok: true, value: 500 });
    expect(contract.getBalance(accounts.user2)).toEqual({ ok: true, value: 500 });
  });

  it("should prevent transfer if blacklisted", () => {
    contract.mint(accounts.deployer, 1000, accounts.user1);
    contract.blacklist(accounts.deployer, accounts.user1, true);
    const transfer = contract.transfer(accounts.user1, 500, accounts.user1, accounts.user2);
    expect(transfer).toEqual({ ok: false, value: 203 });
  });

  it("should allow burning tokens", () => {
    contract.mint(accounts.deployer, 1000, accounts.user1);
    const burn = contract.burn(accounts.user1, 300, accounts.user1);
    expect(burn).toEqual({ ok: true, value: true });
    expect(contract.getBalance(accounts.user1)).toEqual({ ok: true, value: 700 });
    expect(contract.getTotalSupply()).toEqual({ ok: true, value: 700 });
  });

  it("should pause and prevent transfers", () => {
    contract.mint(accounts.deployer, 1000, accounts.user1);
    contract.setPaused(accounts.deployer, true);
    const transfer = contract.transfer(accounts.user1, 500, accounts.user1, accounts.user2);
    expect(transfer).toEqual({ ok: false, value: 201 });
  });

  it("should prevent minting over max supply", () => {
    const largeAmount = 1000000000001;
    const mint = contract.mint(accounts.deployer, largeAmount, accounts.user1);
    expect(mint).toEqual({ ok: false, value: 204 });
  });

  it("should add and remove admins", () => {
    contract.addAdmin(accounts.deployer, accounts.admin);
    const mint = contract.mint(accounts.admin, 1000, accounts.user1);
    expect(mint).toEqual({ ok: true, value: true });
    contract.removeAdmin(accounts.deployer, accounts.admin);
    const mint2 = contract.mint(accounts.admin, 1000, accounts.user1);
    expect(mint2).toEqual({ ok: false, value: 200 });
  });
});
