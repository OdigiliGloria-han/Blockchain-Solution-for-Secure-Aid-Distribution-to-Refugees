// IdentityNFT.test.ts
import { describe, expect, it, beforeEach } from "vitest";

// Interfaces for type safety
interface ClarityResponse<T> {
  ok: boolean;
  value: T | number; // number for error codes
}

interface IdentityMetadata {
  owner: string;
  hash: Uint8Array;
  verified: boolean;
  verificationTimestamp?: number;
  privacyLevel: number;
  additionalMetadata: string;
  status: string;
}

interface ContractState {
  identities: Map<number, IdentityMetadata>;
  admins: Map<string, boolean>;
  nextId: number;
  paused: boolean;
  owner: string;
}

// Mock contract implementation
class IdentityNFTMock {
  private state: ContractState = {
    identities: new Map(),
    admins: new Map(),
    nextId: 1,
    paused: false,
    owner: "deployer",
  };

  private ERR_NOT_AUTHORIZED = 100;
  private ERR_ALREADY_EXISTS = 101;
  private ERR_NOT_FOUND = 102;
  private ERR_INVALID_HASH = 103;
  private ERR_NOT_VERIFIED = 104;
  private ERR_PAUSED = 105;
  private ERR_INVALID_METADATA = 106;
  private ERR_TRANSFER_NOT_ALLOWED = 107;
  private MAX_METADATA_LEN = 500;

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

  mintIdentity(caller: string, hash: Uint8Array, metadata: string, privacy: number): ClarityResponse<number> {
    if (this.state.paused) return { ok: false, value: this.ERR_PAUSED };
    if (hash.length === 0) return { ok: false, value: this.ERR_INVALID_HASH };
    if (metadata.length > this.MAX_METADATA_LEN) return { ok: false, value: this.ERR_INVALID_METADATA };
    if (privacy > 2) return { ok: false, value: this.ERR_INVALID_METADATA };
    const id = this.state.nextId;
    if (this.state.identities.has(id)) return { ok: false, value: this.ERR_ALREADY_EXISTS };
    this.state.identities.set(id, {
      owner: caller,
      hash,
      verified: false,
      privacyLevel: privacy,
      additionalMetadata: metadata,
      status: "pending",
    });
    this.state.nextId += 1;
    return { ok: true, value: id };
  }

  verifyIdentity(caller: string, id: number): ClarityResponse<boolean> {
    const meta = this.state.identities.get(id);
    if (!meta) return { ok: false, value: this.ERR_NOT_FOUND };
    if (!this.isAdmin(caller)) return { ok: false, value: this.ERR_NOT_AUTHORIZED };
    if (meta.verified) return { ok: false, value: this.ERR_ALREADY_EXISTS };
    meta.verified = true;
    meta.verificationTimestamp = Date.now();
    meta.status = "active";
    return { ok: true, value: true };
  }

  updateMetadata(caller: string, id: number, newMetadata: string): ClarityResponse<boolean> {
    const meta = this.state.identities.get(id);
    if (!meta) return { ok: false, value: this.ERR_NOT_FOUND };
    if (caller !== meta.owner) return { ok: false, value: this.ERR_NOT_AUTHORIZED };
    if (!meta.verified) return { ok: false, value: this.ERR_NOT_VERIFIED };
    if (newMetadata.length > this.MAX_METADATA_LEN) return { ok: false, value: this.ERR_INVALID_METADATA };
    meta.additionalMetadata = newMetadata;
    return { ok: true, value: true };
  }

  setPrivacyLevel(caller: string, id: number, newPrivacy: number): ClarityResponse<boolean> {
    const meta = this.state.identities.get(id);
    if (!meta) return { ok: false, value: this.ERR_NOT_FOUND };
    if (caller !== meta.owner) return { ok: false, value: this.ERR_NOT_AUTHORIZED };
    if (newPrivacy > 2) return { ok: false, value: this.ERR_INVALID_METADATA };
    meta.privacyLevel = newPrivacy;
    return { ok: true, value: true };
  }

  revokeIdentity(caller: string, id: number): ClarityResponse<boolean> {
    const meta = this.state.identities.get(id);
    if (!meta) return { ok: false, value: this.ERR_NOT_FOUND };
    if (!this.isAdmin(caller)) return { ok: false, value: this.ERR_NOT_AUTHORIZED };
    meta.status = "revoked";
    meta.verified = false;
    return { ok: true, value: true };
  }

  transfer(caller: string, id: number, sender: string, recipient: string): ClarityResponse<boolean> {
    return { ok: false, value: this.ERR_TRANSFER_NOT_ALLOWED };
  }

  getIdentityDetails(caller: string, id: number): ClarityResponse<IdentityMetadata | null> {
    const meta = this.state.identities.get(id);
    if (!meta) return { ok: false, value: this.ERR_NOT_FOUND };
    if (caller === meta.owner || this.isAdmin(caller)) {
      return { ok: true, value: meta };
    }
    if (meta.privacyLevel === 0) {
      return { ok: true, value: { ...meta, hash: new Uint8Array(), additionalMetadata: "" } };
    }
    return { ok: false, value: this.ERR_NOT_AUTHORIZED };
  }

  isVerified(id: number): ClarityResponse<boolean> {
    const meta = this.state.identities.get(id);
    if (!meta) return { ok: false, value: this.ERR_NOT_FOUND };
    return { ok: true, value: meta.verified };
  }
}

// Test setup
const accounts = {
  deployer: "deployer",
  verifier: "wallet_1",
  refugee1: "wallet_2",
  refugee2: "wallet_3",
};

describe("IdentityNFT Contract", () => {
  let contract: IdentityNFTMock;

  beforeEach(() => {
    contract = new IdentityNFTMock();
  });

  it("should allow minting new identity", () => {
    const hash = new Uint8Array(32);
    const mint = contract.mintIdentity(accounts.refugee1, hash, "Test metadata", 1);
    expect(mint).toEqual({ ok: true, value: 1 });
  });

  it("should prevent minting with invalid metadata", () => {
    const hash = new Uint8Array(32);
    const longMetadata = "a".repeat(501);
    const mint = contract.mintIdentity(accounts.refugee1, hash, longMetadata, 1);
    expect(mint).toEqual({ ok: false, value: 106 });
  });

  it("should allow admin to verify identity", () => {
    const hash = new Uint8Array(32);
    contract.mintIdentity(accounts.refugee1, hash, "Test", 0);
    contract.addAdmin(accounts.deployer, accounts.verifier);
    const verify = contract.verifyIdentity(accounts.verifier, 1);
    expect(verify).toEqual({ ok: true, value: true });
    const isVerified = contract.isVerified(1);
    expect(isVerified).toEqual({ ok: true, value: true });
  });

  it("should prevent non-admin from verifying", () => {
    const hash = new Uint8Array(32);
    contract.mintIdentity(accounts.refugee1, hash, "Test", 0);
    const verify = contract.verifyIdentity(accounts.refugee2, 1);
    expect(verify).toEqual({ ok: false, value: 100 });
  });

  it("should allow owner to update metadata", () => {
    const hash = new Uint8Array(32);
    contract.mintIdentity(accounts.refugee1, hash, "Old", 0);
    contract.verifyIdentity(accounts.deployer, 1);
    const update = contract.updateMetadata(accounts.refugee1, 1, "New metadata");
    expect(update).toEqual({ ok: true, value: true });
  });

  it("should prevent update if not verified", () => {
    const hash = new Uint8Array(32);
    contract.mintIdentity(accounts.refugee1, hash, "Old", 0);
    const update = contract.updateMetadata(accounts.refugee1, 1, "New");
    expect(update).toEqual({ ok: false, value: 104 });
  });

  it("should respect privacy levels in details", () => {
    const hash = new Uint8Array(32);
    contract.mintIdentity(accounts.refugee1, hash, "Private", 2);
    const details = contract.getIdentityDetails(accounts.refugee2, 1);
    expect(details.ok).toBe(false);
  });

  it("should allow admin to revoke identity", () => {
    const hash = new Uint8Array(32);
    contract.mintIdentity(accounts.refugee1, hash, "Test", 0);
    contract.verifyIdentity(accounts.deployer, 1);
    const revoke = contract.revokeIdentity(accounts.deployer, 1);
    expect(revoke).toEqual({ ok: true, value: true });
    const isVerified = contract.isVerified(1);
    expect(isVerified).toEqual({ ok: true, value: false });
  });

  it("should prevent transfers", () => {
    const transfer = contract.transfer(accounts.refugee1, 1, accounts.refugee1, accounts.refugee2);
    expect(transfer).toEqual({ ok: false, value: 107 });
  });

  it("should pause and prevent minting", () => {
    contract.setPaused(accounts.deployer, true);
    const hash = new Uint8Array(32);
    const mint = contract.mintIdentity(accounts.refugee1, hash, "Test", 0);
    expect(mint).toEqual({ ok: false, value: 105 });
  });
});