import { useState, useEffect } from "react";
import { Search, Loader2, Play, Box, Key, X, ArrowRight, Wallet, Activity } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { sha256 } from "js-sha256";
import { Buffer } from "buffer";
import { useWallet } from '../../context/WalletProvider';
import { Transaction, TransactionInstruction, PublicKey, Keypair } from '@solana/web3.js';

interface IdlArg {
  name: string;
  type: string | object;
}

interface IdlAccount {
  name: string;
  isMut: boolean;
  isSigner: boolean;
}

interface IdlInstruction {
  name: string;
  accounts: IdlAccount[];
  args: IdlArg[];
}

interface FetchedIdl {
  methods: IdlInstruction[];
}

interface ApiSendTxRequest {
  rpc_url: string;
  program_id: string;
  accounts: Array<{
    pubkey: string;
    is_signer: boolean;
    is_writable: boolean;
  }>;
  instruction_data: string;
  sign_with_backend: boolean;
  fee_payer: string;
  additional_signers?: Array<{
    name: string;
    secret_key: number[];
  }>;
}

interface ApiReturnData {
  programId: string;
  data: [string, string];
}

interface ApiSendTxResponse {
  signature?: string;
  success?: boolean;
  logs?: string[];
  return_data?: ApiReturnData | null;
  error?: string;
  detail?: string | Record<string, any>;
  code?: string;
  reason?: string;
  friendly_error?: string;
}

type ReturnFieldType =
  | "u8"
  | "u16"
  | "u32"
  | "u64"
  | "u128"
  | "i8"
  | "i16"
  | "i32"
  | "i64"
  | "i128"
  | "bool"
  | "string"
  | "bytes"
  | "pubkey";

interface ReturnField {
  id: string;
  name: string;
  type: ReturnFieldType;
}

type DecodedReturnField = {
  name: string;
  type: ReturnFieldType;
  value: string;
};

type ReturnDataInfo = {
  programId: string;
  base64: string;
  hex: string;
  encoding?: string;
  decoded?: string;
  fields?: DecodedReturnField[];
};

const RETURN_FIELD_TYPE_OPTIONS: { label: string; value: ReturnFieldType }[] = [
  { label: "u8", value: "u8" },
  { label: "u16", value: "u16" },
  { label: "u32", value: "u32" },
  { label: "u64", value: "u64" },
  { label: "u128", value: "u128" },
  { label: "i8", value: "i8" },
  { label: "i16", value: "i16" },
  { label: "i32", value: "i32" },
  { label: "i64", value: "i64" },
  { label: "i128", value: "i128" },
  { label: "Bool", value: "bool" },
  { label: "String", value: "string" },
  { label: "Bytes", value: "bytes" },
  { label: "Pubkey", value: "pubkey" },
];

const createId = () => Math.random().toString(36).slice(2, 9);

const SYSTEM_PROGRAM_ID = "11111111111111111111111111111111";

// Convert camelCase/PascalCase to snake_case for Anchor discriminator
function toSnakeCase(str: string): string {
  return str
    .replace(/([A-Z])/g, (match, p1, offset) => (offset > 0 ? '_' : '') + p1.toLowerCase())
    .replace(/^_/, ''); // Remove leading underscore if first char was uppercase
}

function getInstructionDiscriminator(instructionName: string): Buffer {
  const snakeCaseName = toSnakeCase(instructionName);
  console.log(`Discriminator: global:${snakeCaseName} (from ${instructionName})`);
  const hash = sha256(`global:${snakeCaseName}`);
  return Buffer.from(hash, 'hex').slice(0, 8);
}

function readBigIntFromBuffer(
  buffer: Buffer,
  offset: number,
  byteLength: number,
  signed = false
): bigint {
  let result = 0n;
  for (let i = 0; i < byteLength; i++) {
    const byte = BigInt(buffer[offset + i]);
    result |= byte << BigInt(8 * i);
  }

  if (signed) {
    const max = 1n << BigInt(byteLength * 8);
    const threshold = max >> 1n;
    if (result >= threshold) {
      result -= max;
    }
  }

  return result;
}

function decodeWithLayout(buffer: Buffer, layout: ReturnField[]): DecodedReturnField[] {
  const decoded: DecodedReturnField[] = [];
  let offset = 0;

  for (const field of layout) {
    const name = field.name?.trim() || `field_${decoded.length + 1}`;
    const type = field.type;

    try {
      const ensureBytes = (required: number) => {
        const remaining = buffer.length - offset;
        if (remaining < required) {
          throw new Error(`Need ${required} more bytes, only ${remaining} left`);
        }
      };

      const numericTypes: Record<string, { bytes: number; signed: boolean }> = {
        u8: { bytes: 1, signed: false },
        u16: { bytes: 2, signed: false },
        u32: { bytes: 4, signed: false },
        u64: { bytes: 8, signed: false },
        u128: { bytes: 16, signed: false },
        i8: { bytes: 1, signed: true },
        i16: { bytes: 2, signed: true },
        i32: { bytes: 4, signed: true },
        i64: { bytes: 8, signed: true },
        i128: { bytes: 16, signed: true },
      };

      if (numericTypes[type]) {
        const spec = numericTypes[type];
        ensureBytes(spec.bytes);
        const value = readBigIntFromBuffer(buffer, offset, spec.bytes, spec.signed);
        decoded.push({ name, type, value: value.toString() });
        offset += spec.bytes;
        continue;
      }

      if (type === "bool") {
        ensureBytes(1);
        const value = buffer.readUInt8(offset) === 1 ? "true" : "false";
        decoded.push({ name, type, value });
        offset += 1;
        continue;
      }

      if (type === "pubkey") {
        ensureBytes(32);
        const pubkeyBytes = buffer.subarray(offset, offset + 32);
        const pubkey = new PublicKey(pubkeyBytes).toBase58();
        decoded.push({ name, type, value: pubkey });
        offset += 32;
        continue;
      }

      if (type === "string" || type === "bytes") {
        ensureBytes(4);
        const length = buffer.readUInt32LE(offset);
        offset += 4;
        ensureBytes(length);
        const slice = buffer.subarray(offset, offset + length);
        offset += length;
        const value = type === "string" ? slice.toString("utf8") : slice.toString("hex");
        decoded.push({ name, type, value });
        continue;
      }

      throw new Error(`Unsupported field type '${type}'`);
    } catch (error) {
      decoded.push({
        name,
        type,
        value: `Decode error: ${(error as Error).message}`,
      });
      break;
    }
  }

  return decoded;
}

function formatReturnData(
  raw: ApiReturnData | null,
  layout: ReturnField[]
): ReturnDataInfo | null {
  if (!raw || !raw.data?.length) {
    return null;
  }

  const [payload, encoding] = raw.data;

  try {
    const buffer = Buffer.from(payload, "base64");
    const hex = buffer.toString("hex");
    const baseInfo: ReturnDataInfo = {
      programId: raw.programId,
      base64: payload,
      hex,
      encoding,
    };

    if (layout.length) {
      return {
        ...baseInfo,
        fields: decodeWithLayout(buffer, layout),
      };
    }

    if (buffer.length === 8) {
      try {
        baseInfo.decoded = buffer.readBigUInt64LE(0).toString();
      } catch (err) {
        console.error("Failed to parse u64 return data", err);
      }
    }

    return baseInfo;
  } catch (err) {
    console.error("Failed to decode return data", err);
    return {
      programId: raw.programId,
      base64: payload,
      hex: "",
      encoding,
    };
  }
}

function detailToMessage(detail: ApiSendTxResponse["detail"]): string | undefined {
  if (!detail) {
    return undefined;
  }

  if (typeof detail === "string") {
    return detail;
  }

  if (typeof detail === "object") {
    if (typeof (detail as any).friendly_error === "string") {
      return (detail as any).friendly_error;
    }
    if (typeof (detail as any).reason === "string") {
      return (detail as any).reason;
    }
    if (typeof detail.message === "string") {
      return detail.message;
    }
    if (typeof detail.detail === "string") {
      return detail.detail;
    }
    if (typeof detail.reason === "string") {
      return detail.reason;
    }

    try {
      return JSON.stringify(detail);
    } catch (err) {
      console.error("Failed to stringify error detail", err);
      return undefined;
    }
  }

  return undefined;
}

function deriveFriendlyError(
  baseMessage: string | undefined,
  logs: string[]
): string {
  const normalizedBase = baseMessage?.trim();
  const defaultMessage =
    normalizedBase && normalizedBase.length
      ? normalizedBase
      : "Transaction failed during contract execution.";

  if (!logs?.length) {
    return `${defaultMessage} Check the logs or try again.`;
  }

  const patterns: RegExp[] = [
    /Program log: Error: (.*)/i,
    /Program log: panicked at '([^']+)'/i,
    /Program log: (.*failed.*)/i,
  ];

  for (const log of logs) {
    for (const pattern of patterns) {
      const match = log.match(pattern);
      if (match && match[1]) {
        const friendly = match[1].trim();
        return `${defaultMessage} Contract reported: ${friendly}.`;
      }
    }
  }

  const panicLog = logs.find((log) => log.toLowerCase().includes("panicked"));
  if (panicLog) {
    return `${defaultMessage} Contract panicked: ${panicLog.replace(
      /Program log:/i,
      ""
    ).trim()}.`;
  }

  return `${defaultMessage} See contract logs below for details.`;
}

function extractLogsFromResponse(json: ApiSendTxResponse): string[] {
  if (Array.isArray(json.logs)) {
    return json.logs;
  }

  if (json.detail && typeof json.detail === "object") {
    const potentialLogs = (json.detail as any).logs;
    if (Array.isArray(potentialLogs)) {
      return potentialLogs;
    }
  }

  return [];
}

type NumericTypeInfo = {
  bits: number;
  signed: boolean;
  useBigInt?: boolean;
};

const NUMERIC_TYPE_INFO: Record<string, NumericTypeInfo> = {
  u8: { bits: 8, signed: false },
  u16: { bits: 16, signed: false },
  u32: { bits: 32, signed: false },
  u64: { bits: 64, signed: false, useBigInt: true },
  u128: { bits: 128, signed: false, useBigInt: true },
  i8: { bits: 8, signed: true },
  i16: { bits: 16, signed: true },
  i32: { bits: 32, signed: true },
  i64: { bits: 64, signed: true, useBigInt: true },
  i128: { bits: 128, signed: true, useBigInt: true },
};

function randomInt(min: number, max: number): number {
  if (min === max) return min;
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function resolveArgType(type: IdlArg["type"]): string {
  if (typeof type === "string") {
    return type;
  }

  if (type && typeof type === "object") {
    const obj = type as Record<string, any>;
    if ("defined" in obj) return String(obj.defined || "string");
    if ("vec" in obj) return "vec";
    if ("option" in obj) return resolveArgType(obj.option);
    if ("coption" in obj) return resolveArgType(obj.coption);
    if ("array" in obj) return "array";
  }

  return "string";
}

function generateValueForType(typeName: string): string {
  const normalized = typeName.toLowerCase();

  const numericInfo = NUMERIC_TYPE_INFO[normalized];
  if (numericInfo) {
    if (numericInfo.useBigInt) {
      const magnitude = BigInt(Math.floor(Math.random() * 10_000)) + 1n;
      let value = magnitude;
      if (numericInfo.signed) {
        const negativeBias = Math.random() < 0.75;
        value = negativeBias ? -magnitude : magnitude;
      }
      return value.toString();
    }

    const { bits, signed } = numericInfo;
    const max = signed ? 2 ** (bits - 1) - 1 : 2 ** bits - 1;
    const min = signed ? -(2 ** (bits - 1)) : 0;

    if (signed) {
      const preferNegative = Math.random() < 0.75;
      if (preferNegative) {
        const upper = Math.min(-1, max);
        return randomInt(min, upper).toString();
      }
      return randomInt(0, max).toString();
    }

    return randomInt(min, max).toString();
  }

  if (normalized === "bool") {
    return Math.random() > 0.5 ? "true" : "false";
  }

  if (normalized === "string") {
    return `auto_${Math.random().toString(36).slice(2, 10)}`;
  }

  if (normalized === "bytes") {
    const bytes = Array.from({ length: 8 }, () =>
      Math.floor(Math.random() * 256)
    );
    return Buffer.from(bytes).toString("hex");
  }

  if (normalized === "pubkey" || normalized === "publickey") {
    return Keypair.generate().publicKey.toBase58();
  }

  if (normalized === "vec" || normalized === "array") {
    return "[]";
  }

  return "";
}

function generateValueForArg(arg: IdlArg): string {
  const typeName = resolveArgType(arg.type);
  return generateValueForType(typeName) || "";
}

const BIGINT_BYTE_LENGTH: Record<string, number> = {
  u64: 8,
  i64: 8,
  u128: 16,
  i128: 16,
};

function parseBigIntInput(raw: string | undefined, argName: string): bigint {
  const normalized = (raw ?? "0").toString().trim();
  if (!normalized) {
    return 0n;
  }

  try {
    return BigInt(normalized);
  } catch (err) {
    throw new Error(`[${argName}] Invalid integer value: ${raw}`);
  }
}

function ensureBigIntRange(
  value: bigint,
  bits: number,
  signed: boolean,
  argName: string,
  typeLabel: string
): void {
  const totalBits = BigInt(bits);

  if (signed) {
    const min = -(BigInt(1) << (totalBits - BigInt(1)));
    const max = (BigInt(1) << (totalBits - BigInt(1))) - BigInt(1);
    if (value < min || value > max) {
      throw new Error(
        `[${argName}] Value ${value.toString()} is out of range for ${typeLabel}`
      );
    }
  } else {
    if (value < BigInt(0)) {
      throw new Error(`[${argName}] ${typeLabel} must be greater than or equal to 0`);
    }
    const max = (BigInt(1) << totalBits) - BigInt(1);
    if (value > max) {
      throw new Error(
        `[${argName}] Value ${value.toString()} is out of range for ${typeLabel}`
      );
    }
  }
}

function writeBigIntToBuffer(
  buffer: Buffer,
  rawValue: string | undefined,
  offset: number,
  typeName: string,
  argName: string
): number {
  const byteLength = BIGINT_BYTE_LENGTH[typeName];
  if (!byteLength) {
    throw new Error(`Unsupported bigint type ${typeName}`);
  }

  const signed = typeName.startsWith("i");
  const bits = byteLength * 8;
  const value = parseBigIntInput(rawValue, argName);
  ensureBigIntRange(value, bits, signed, argName, typeName);

  let normalized = value;
  if (signed && value < 0n) {
    const mod = 1n << BigInt(bits);
    normalized = mod + value;
  }

  for (let i = 0; i < byteLength; i++) {
    buffer[offset + i] = Number(normalized & 0xffn);
    normalized >>= 8n;
  }

  return byteLength;
}

function parseIntegerInput(raw: string | undefined, argName: string): number {
  if (raw === undefined || raw === null || raw === "") {
    return 0;
  }

  const num = Number(raw);
  if (!Number.isFinite(num)) {
    throw new Error(`[${argName}] Value must be a finite number`);
  }
  if (!Number.isInteger(num)) {
    throw new Error(`[${argName}] Value must be an integer`);
  }

  return num;
}

function ensureNumberRange(
  value: number,
  bits: number,
  signed: boolean,
  argName: string,
  typeLabel: string
): void {
  const min = signed ? -(2 ** (bits - 1)) : 0;
  const max = signed ? 2 ** (bits - 1) - 1 : 2 ** bits - 1;
  if (value < min || value > max) {
    throw new Error(`[${argName}] Value ${value} is out of range for ${typeLabel}`);
  }
}

export default function AnchorMode() {
  const [programId, setProgramId] = useState("");
  const [network, setNetwork] = useState("devnet");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [idl, setIdl] = useState<FetchedIdl | null>(null);
  const [selectedInstruction, setSelectedInstruction] = useState<IdlInstruction | null>(null);
  const { isConnected, signTransaction, rpcUrl, setRpcUrl } = useWallet();

  const isValidProgramId = (value: string) => {
    try { new PublicKey(value); return true; } catch { return false; }
  };
  const isProgramIdValid = isValidProgramId(programId);

 const handleFetchIdl = async () => {
  setIsLoading(true);
  setIdl(null);
  setError(null);

  try {
    const effectiveRpcUrl = rpcUrl || (
      network === "mainnet" 
        ? "https://api.mainnet-beta.solana.com"
        : "https://api.devnet.solana.com"
    );

    const baseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
    const res = await fetch(
      `${baseUrl}/solana/idl/${programId}/methods?rpc_url=${encodeURIComponent(effectiveRpcUrl)}`
    );
    
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || `Failed to fetch IDL (${res.status})`);
      }

      const data: FetchedIdl = await res.json();
      setIdl(data);
    } catch (err: any) {
      console.error("Error:", err.message);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };
 
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-8">
        
        {/* Header + Input Section */}
        <div className="space-y-6">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Anchor Mode</h2>
            <p className="text-muted-foreground mt-1">Fetch and explore on-chain program IDLs.</p>
          </div>

          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="w-full sm:w-32 space-y-2">
              <label className="text-xs font-mono uppercase tracking-wider text-muted-foreground/80">Network</label>
              <div className="relative">
                <select 
                  value={network}
                  onChange={(e) => {
                    const newNetwork = e.target.value;
                    setNetwork(newNetwork);
                    const newRpc = newNetwork === "mainnet"
                      ? "https://api.mainnet-beta.solana.com"
                      : "https://api.devnet.solana.com";
                    setRpcUrl(newRpc);
                  }}
                  className="w-full bg-background/50 border border-border/50 rounded-lg py-3 px-3 pr-8 font-mono text-sm focus:ring-2 focus:ring-primary/50 focus:border-primary/50 outline-none transition-all shadow-sm appearance-none cursor-pointer hover:bg-background/70 hover:border-border [&>option]:bg-background [&>option]:text-foreground [&>option]:border-none"
                >
                  <option value="mainnet">Mainnet</option>
                  <option value="devnet">Devnet</option>
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground transition-colors">
                  <svg width="10" height="6" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
              </div>
            </div>

            <div className="flex-1 space-y-2 w-full">
              <label className="text-xs font-mono uppercase tracking-wider text-muted-foreground/80">Program ID</label>
              <div className="relative group">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  value={programId}
                  onChange={(e) => setProgramId(e.target.value)}
                  placeholder="Ex: TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
                  className="w-full bg-background/50 border border-border/50 rounded-lg py-3 pl-10 pr-4 font-mono text-sm focus:ring-1 focus:ring-primary/50 outline-none transition-all shadow-sm"
                />
              </div>
            </div>
            <button
              onClick={handleFetchIdl}
              disabled={isLoading || !isProgramIdValid}
              className={cn(
                "w-full sm:w-auto px-6 py-3 rounded-lg font-medium text-sm flex items-center justify-center gap-2 transition-all shadow-sm",
                isLoading || !isProgramIdValid
                  ? "bg-muted text-muted-foreground cursor-not-allowed opacity-50"
                  : "bg-primary text-primary-foreground hover:bg-primary/90"
              )}
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
              Fetch IDL
            </button>
          </div>
        </div>

        {/* Table Section - Shows skeleton or real data */}
        <div className="border border-border/40 rounded-xl bg-card/30 backdrop-blur-sm shadow-sm overflow-hidden">
          {error && (
            <div className="p-4 bg-destructive/10 text-destructive text-sm border-b border-destructive/20 flex items-center gap-2">
              <Activity className="h-4 w-4" />
              {error}
            </div>
          )}
          <div className="overflow-x-auto [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar-track]:bg-background/30 [&::-webkit-scrollbar-thumb]:bg-primary/30 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:hover:bg-primary/50">
            <table className="w-full min-w-[640px] text-sm text-left">
              <thead className="text-xs uppercase bg-muted/30 text-muted-foreground font-medium">
                <tr>
                  <th className="px-6 py-4 font-mono w-1/4">Instruction Name</th>
                  <th className="px-6 py-4 font-mono w-1/2">Required Arguments</th>
                  <th className="px-6 py-4 text-right w-1/4">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {isLoading ? (
                  // Skeleton rows while loading
                  [...Array(3)].map((_, idx) => (
                    <tr key={idx} className="animate-pulse">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-2 rounded-full bg-muted" />
                          <div className="h-4 w-32 bg-muted rounded" />
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex gap-2">
                          <div className="h-6 w-20 bg-muted rounded" />
                          <div className="h-6 w-24 bg-muted rounded" />
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="h-7 w-16 bg-muted rounded ml-auto" />
                      </td>
                    </tr>
                  ))
                ) : idl && idl.methods ? (
                  // Real data
                  idl.methods.map((ix, idx) => (
                    <tr key={idx} className="group hover:bg-muted/20 transition-colors">
                      <td className="px-6 py-4 font-medium text-foreground">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-2 rounded-full bg-blue-500/50 group-hover:bg-blue-500 transition-colors" />
                          {ix.name}
                        </div>
                      </td>
                      <td className="px-6 py-4 font-mono text-muted-foreground">
                        {ix.args.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {ix.args.map((arg, i) => (
                              <span key={i} className="bg-secondary/50 px-2 py-1 rounded text-xs border border-border/50">
                                {arg.name}
                              </span>
                            ))}
                          </div>
                        ) : <span className="opacity-30 italic">No arguments</span>}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button 
                          onClick={() => setSelectedInstruction(ix)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20 transition-all"
                        >
                          <Play className="h-3 w-3 fill-current" /> Run
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  // Empty state - skeleton placeholder
                  [...Array(3)].map((_, idx) => (
                    <tr key={idx} className="opacity-40">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-2 rounded-full bg-muted/50" />
                          <div className="h-4 w-32 bg-muted/30 rounded" />
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex gap-2">
                          <div className="h-6 w-20 bg-muted/30 rounded" />
                          <div className="h-6 w-24 bg-muted/30 rounded" />
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="h-7 w-16 bg-muted/30 rounded ml-auto" />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {selectedInstruction && (
          <ExecutorModal 
            instruction={selectedInstruction} 
            programId={programId}
            network={network}
            onClose={() => setSelectedInstruction(null)} 
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function ExecutorModal({ 
    instruction, 
    programId, 
    network,
    onClose 
    
}: { 
    instruction: IdlInstruction; 
    programId: string;
    network: string;
    onClose: () => void 

    
}) {
    const [isSending, setIsSending] = useState(false);
    const [responseStatus, setResponseStatus] = useState<number | null>(null);
    const [responseMessage, setResponseMessage] = useState<string>("");
    const { rpcUrl } = useWallet();
    const [argValues, setArgValues] = useState<Record<string, string>>({});
    const [accountValues, setAccountValues] = useState<Record<string, string>>({});
    const [backendWallet, setBackendWallet] = useState<string | null>(null);
    const [generatedKeypairs, setGeneratedKeypairs] = useState<Record<string, { pubkey: string; secret_key: number[] }>>({});
    const [returnLayout, setReturnLayout] = useState<ReturnField[]>([]);
    const [rawReturnData, setRawReturnData] = useState<ApiReturnData | null>(null);
    const [returnDataInfo, setReturnDataInfo] = useState<ReturnDataInfo | null>(null);
    const [txLogs, setTxLogs] = useState<string[]>([]);

    const shouldAutoGenerateAccount = (acc: IdlAccount) => acc.isMut && !acc.isSigner;

    useEffect(() => {
      setArgValues({});
      setAccountValues({});
      setGeneratedKeypairs({});
      setReturnLayout([]);
      setRawReturnData(null);
      setReturnDataInfo(null);
      setTxLogs([]);
    }, [instruction.name]);

    useEffect(() => {
      setReturnDataInfo(formatReturnData(rawReturnData, returnLayout));
    }, [rawReturnData, returnLayout]);

    useEffect(() => {
        const fetchBackendWallet = async () => {
            try {
                const baseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
                const res = await fetch(`${baseUrl}/solana/tx/wallet`);
                if (res.ok) {
                    const data = await res.json();
                    setBackendWallet(data.pubkey);
                }
            } catch (e) {
                console.error("Failed to fetch backend wallet", e);
            }
        };
        fetchBackendWallet();
    }, []);

    const handleGenerateAccount = (accountName: string) => {
      setGeneratedKeypairs((prev) => {
        const existing = prev[accountName];
        const keypair = Keypair.generate();
        const pubkey = keypair.publicKey.toBase58();
        const secret_key = Array.from(keypair.secretKey);

        if (existing?.pubkey === pubkey) {
          return prev;
        }

        setAccountValues((prevValues) => ({
          ...prevValues,
          [accountName]: pubkey,
        }));

        return {
          ...prev,
          [accountName]: { pubkey, secret_key },
        };
      });
    };

    const handleGenerateArgValue = (arg: IdlArg) => {
      const value = generateValueForArg(arg);
      setArgValues((prev) => ({ ...prev, [arg.name]: value }));
    };

    const handleGenerateAllArgs = () => {
      if (!instruction.args?.length) {
        return;
      }

      setArgValues((prev) => {
        const next = { ...prev };
        instruction.args.forEach((arg) => {
          next[arg.name] = generateValueForArg(arg);
        });
        return next;
      });
    };

    useEffect(() => {
      if (!instruction?.accounts?.length) {
        return;
      }

      instruction.accounts.forEach((acc) => {
        if (shouldAutoGenerateAccount(acc)) {
          setGeneratedKeypairs((prev) => {
            if (prev[acc.name]) {
              return prev;
            }

            const keypair = Keypair.generate();
            const pubkey = keypair.publicKey.toBase58();
            const secret_key = Array.from(keypair.secretKey);

            setAccountValues((prevValues) => ({
              ...prevValues,
              [acc.name]: pubkey,
            }));

            return {
              ...prev,
              [acc.name]: { pubkey, secret_key },
            };
          });
        }
      });
    }, [instruction]);

    useEffect(() => {
      if (!instruction?.args?.length) {
        return;
      }

      setArgValues((prev) => {
        let changed = false;
        const next = { ...prev };

        instruction.args.forEach((arg) => {
          const typeName = resolveArgType(arg.type).toLowerCase();
          if (
            (typeName === "pubkey" || typeName === "publickey") &&
            !next[arg.name]
          ) {
            next[arg.name] = Keypair.generate().publicKey.toBase58();
            changed = true;
          }
        });

        return changed ? next : prev;
      });
    }, [instruction]);

    useEffect(() => {
      if (!instruction?.accounts?.length) {
        return;
      }

      setAccountValues((prev) => {
        let changed = false;
        const next = { ...prev };

        instruction.accounts.forEach((acc) => {
          const name = acc.name.toLowerCase();
          if (name === "systemprogram" || name === "system_program") {
            if (next[acc.name] !== SYSTEM_PROGRAM_ID) {
              next[acc.name] = SYSTEM_PROGRAM_ID;
              changed = true;
            }
          }
        });

        return changed ? next : prev;
      });
    }, [instruction]);

    const handleAddReturnField = () => {
      setReturnLayout((prev) => [
        ...prev,
        {
          id: createId(),
          name: `field_${prev.length + 1}`,
          type: "u64",
        },
      ]);
    };

    const handleUpdateReturnField = (
      id: string,
      patch: Partial<Pick<ReturnField, "name" | "type">>
    ) => {
      setReturnLayout((prev) =>
        prev.map((field) =>
          field.id === id
            ? {
                ...field,
                ...patch,
              }
            : field
        )
      );
    };

    const handleRemoveReturnField = (id: string) => {
      setReturnLayout((prev) => prev.filter((field) => field.id !== id));
    };

    const handleClearReturnLayout = () => {
      setReturnLayout([]);
    };

    const handleSend = async () => {
        setIsSending(true);
        setResponseStatus(null);
        setResponseMessage("");
        setRawReturnData(null);
        setReturnDataInfo(null);
        setTxLogs([]);

        const discriminator = getInstructionDiscriminator(instruction.name);
        
        // Validate accounts
        for (const acc of instruction.accounts) {
            if (!accountValues[acc.name]) {
                setResponseMessage(`Error: Missing public key for account '${acc.name}'`);
                setIsSending(false);
                return;
            }
        }

        try {
            const argsBuffer = Buffer.alloc(1024);
            let offset = 0;
            
            discriminator.copy(argsBuffer, offset);
            offset += 8;
            
            console.log(`Instruction: ${instruction.name}, Args count: ${instruction.args.length}`);
            console.log(`Discriminator (hex): ${discriminator.toString('hex')}`);
            
            for (const arg of instruction.args) {
                const value = argValues[arg.name];
              const resolvedType = resolveArgType(arg.type);
              const typeName = resolvedType.toLowerCase();
                
              console.log(`Processing arg ${arg.name} of type`, resolvedType, `(interpreted as ${typeName}) with value:`, value);

              if (
                typeName === 'u64' ||
                typeName === 'u128' ||
                typeName === 'i64' ||
                typeName === 'i128'
              ) {
                const written = writeBigIntToBuffer(
                  argsBuffer,
                  value,
                  offset,
                  typeName,
                  arg.name
                );
                offset += written;
              } else if (typeName === 'u32' || typeName === 'i32') {
                const val = parseIntegerInput(value, arg.name);
                ensureNumberRange(
                  val,
                  32,
                  typeName.startsWith('i'),
                  arg.name,
                  resolvedType
                );
                if (typeName.startsWith('u')) argsBuffer.writeUInt32LE(val, offset);
                else argsBuffer.writeInt32LE(val, offset);
                offset += 4;
              } else if (typeName === 'u16' || typeName === 'i16') {
                const val = parseIntegerInput(value, arg.name);
                ensureNumberRange(
                  val,
                  16,
                  typeName.startsWith('i'),
                  arg.name,
                  resolvedType
                );
                if (typeName.startsWith('u')) argsBuffer.writeUInt16LE(val, offset);
                else argsBuffer.writeInt16LE(val, offset);
                offset += 2;
              } else if (typeName === 'u8' || typeName === 'i8') {
                const val = parseIntegerInput(value, arg.name);
                ensureNumberRange(
                  val,
                  8,
                  typeName.startsWith('i'),
                  arg.name,
                  resolvedType
                );
                if (typeName.startsWith('u')) argsBuffer.writeUInt8(val, offset);
                else argsBuffer.writeInt8(val, offset);
                offset += 1;
              } else if (typeName === 'string') {
                    const strBytes = Buffer.from(value || '', 'utf8');
                    argsBuffer.writeUInt32LE(strBytes.length, offset);
                    offset += 4;
                    strBytes.copy(argsBuffer, offset);
                    offset += strBytes.length;
                } else if (typeName === 'bool') {
                const normalized = (value ?? '').toString().trim().toLowerCase();
                if (!normalized || normalized === 'false' || normalized === '0') {
                  argsBuffer.writeUInt8(0, offset);
                } else if (normalized === 'true' || normalized === '1') {
                  argsBuffer.writeUInt8(1, offset);
                } else {
                  throw new Error(`[${arg.name}] Invalid bool value. Use true/false or 1/0.`);
                }
                    offset += 1;
              } else if (typeName === 'publickey' || typeName === 'pubkey') {
                    try {
                        const pubkey = new PublicKey(value);
                        const pubkeyBytes = pubkey.toBuffer();
                        pubkeyBytes.copy(argsBuffer, offset);
                        offset += 32;
                    } catch {
                        throw new Error(`Invalid PublicKey for ${arg.name}`);
                    }
                } else {
                    console.warn(`Unsupported or complex type for arg ${arg.name}:`, arg.type);
                    // Fallback to string for now, but log warning. 
                    // This is likely where it fails for complex types.
                    const strBytes = Buffer.from(value || '', 'utf8');
                    argsBuffer.writeUInt32LE(strBytes.length, offset);
                    offset += 4;
                    strBytes.copy(argsBuffer, offset);
                    offset += strBytes.length;
                }
            }
            
            const finalBuffer = argsBuffer.slice(0, offset);
            const instructionData = finalBuffer.toString('base64');
            
            console.log(`Final instruction data (hex): ${finalBuffer.toString('hex')}`);
            console.log(`Final instruction data (base64): ${instructionData}`);
            console.log(`Total bytes: ${offset} (8 discriminator + ${offset - 8} args)`);

            const accountsPayload = instruction.accounts.map(acc => {
              const generated = generatedKeypairs[acc.name];
              return {
                pubkey: generated?.pubkey || accountValues[acc.name] || "",
                is_signer: acc.isSigner || Boolean(generated),
                is_writable: acc.isMut,
              };
            });

            const additionalSigners = Object.entries(generatedKeypairs).map(
              ([name, kp]) => ({ name, secret_key: kp.secret_key })
            );

            console.log("Accounts payload:", accountsPayload);
            console.log("Additional signers:", additionalSigners.map((s) => s.name));

            const feePayerValue =
              accountValues['authority'] ||
              accountValues['payer'] ||
              accountValues['signer'] ||
              backendWallet ||
              "";

           const payload: ApiSendTxRequest = {
            rpc_url: rpcUrl || (network === "mainnet" 
              ? "https://api.mainnet-beta.solana.com" 
              : "https://api.devnet.solana.com"),
                program_id: programId,
              accounts: accountsPayload,
                instruction_data: instructionData,
                sign_with_backend: true,
              fee_payer: feePayerValue,
              additional_signers: additionalSigners.length ? additionalSigners : undefined,
            };

            const baseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
            const res = await fetch(`${baseUrl}/solana/tx/send`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            setResponseStatus(res.status);
            const json: ApiSendTxResponse = await res.json();

            if (res.ok) {
              setResponseMessage(json.signature || "Transaction sent successfully!");
              setTxLogs(json.logs || []);
              setRawReturnData(json.return_data || null);
            } else {
              const baseError =
                json.error ||
                json.friendly_error ||
                detailToMessage(json.detail) ||
                json.reason ||
                json.code ||
                `Request failed (${res.status})`;
              const logs = extractLogsFromResponse(json);
              setTxLogs(logs);
              setResponseMessage(deriveFriendlyError(baseError, logs));
              setRawReturnData(json.return_data || null);
            }

        } catch (error: any) {
          const friendly = error?.message || "Failed to send transaction";
          const isUserError = typeof friendly === "string" && friendly.trim().startsWith("[");
          setResponseStatus(isUserError ? 400 : 500);
          setResponseMessage(friendly);
            setTxLogs([]);
            setRawReturnData(null);
            setReturnDataInfo(null);
        } finally {
            setIsSending(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={onClose}
                className="absolute inset-0 bg-background/80 backdrop-blur-sm"
            />

            <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                className="relative w-full max-w-lg bg-card border border-border shadow-2xl rounded-xl overflow-hidden flex flex-col max-h-[90vh]"
            >
                <div className="px-6 py-4 border-b border-border/40 flex justify-between items-center bg-muted/20">
                    <div className="space-y-1">
                        <h3 className="font-semibold flex items-center gap-2">
                           <Box className="h-4 w-4 text-primary" /> 
                           Execute: <span className="font-mono text-primary">{instruction.name}</span>
                        </h3>
                    </div>
                    <button onClick={onClose} className="p-1 hover:bg-muted rounded-md transition-colors"><X className="h-4 w-4" /></button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {instruction.args.length > 0 && (
                        <div className="space-y-4">
                         <div className="flex items-center justify-between gap-2">
                          <h4 className="text-xs font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                            Variables (Arguments)
                          </h4>
                          <button
                            onClick={handleGenerateAllArgs}
                            disabled={!instruction.args.length}
                            className={cn(
                              "px-3 py-1 text-xs rounded border border-border",
                              instruction.args.length
                                ? "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                                : "bg-muted text-muted-foreground cursor-not-allowed"
                            )}
                          >
                            Generate All
                          </button>
                         </div>
                             <div className="grid gap-3">
                                {instruction.args.map((arg, i) => {
                                  const typeLabel = resolveArgType(arg.type);
                                  const normalizedType = typeLabel.toLowerCase();
                                  const isPubkeyArg =
                                    normalizedType === "pubkey" ||
                                    normalizedType === "publickey";

                                  return (
                                    <div key={i} className="flex flex-col space-y-1.5">
                                      <label className="text-sm font-medium flex justify-between">
                                        {arg.name}
                                        <span className="text-xs text-muted-foreground font-mono">
                                          {typeLabel}
                                        </span>
                                      </label>
                                      <div className="flex gap-2">
                                        <input 
                                          value={argValues[arg.name] || ""}
                                          onChange={(e) => setArgValues(prev => ({...prev, [arg.name]: e.target.value}))}
                                          placeholder={isPubkeyArg ? "Auto-generated Pubkey" : `Value for ${arg.name}`}
                                          className="flex-1 bg-background border border-border rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-primary/50 outline-none"
                                        />
                                        <button
                                          onClick={() => handleGenerateArgValue(arg)}
                                          className="px-2 py-1 text-xs border border-border rounded-md bg-primary/10 text-primary hover:bg-primary/20"
                                        >
                                          Generate
                                        </button>
                                      </div>
                                      {isPubkeyArg && (
                                        <p className="text-xs text-muted-foreground">
                                          We pre-filled a fresh Solana address for you—replace it with any pubkey as needed.
                                        </p>
                                      )}
                                    </div>
                                  );
                                })}
                             </div>
                        </div>
                    )}

                    <div className="space-y-4">
                        <h4 className="text-xs font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                           <Key className="h-3 w-3" /> Accounts Config
                        </h4>
                        <div className="grid gap-3">
                          {instruction.accounts.map((acc, i) => {
                            const normalizedName = acc.name.toLowerCase();
                            const isSystemProgram = normalizedName === "systemprogram" || normalizedName === "system_program";

                            return (
                              <div key={i} className="flex flex-col space-y-1.5">
                                <label className="text-sm font-medium flex items-center gap-2">
                                  {acc.name}
                                  <div className="flex gap-1">
                                    {acc.isMut && <span className="text-[10px] bg-orange-500/10 text-orange-500 px-1.5 py-0.5 rounded border border-orange-500/20">Writable</span>}
                                    {acc.isSigner && <span className="text-[10px] bg-blue-500/10 text-blue-500 px-1.5 py-0.5 rounded border border-blue-500/20">Signer</span>}
                                    {isSystemProgram && <span className="text-[10px] bg-green-500/10 text-green-500 px-1.5 py-0.5 rounded border border-green-500/20">System Program</span>}
                                    {shouldAutoGenerateAccount(acc) && <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded border border-primary/20">Init Account</span>}
                                  </div>
                                </label>
                                <div className="flex gap-2">
                                  <input 
                                    value={isSystemProgram ? SYSTEM_PROGRAM_ID : accountValues[acc.name] || ""}
                                    onChange={(e) => {
                                      if (isSystemProgram) return;
                                      setAccountValues(prev => ({...prev, [acc.name]: e.target.value}));
                                    }}
                                    placeholder={isSystemProgram ? SYSTEM_PROGRAM_ID : "Public Key"}
                                    disabled={isSystemProgram}
                                    className="flex-1 bg-background border border-border rounded-md px-3 py-2 text-sm font-mono focus:ring-1 focus:ring-primary/50 outline-none disabled:bg-muted"
                                  />
                                  {backendWallet && acc.isSigner && !isSystemProgram && (
                                    <button 
                                      onClick={() => setAccountValues(prev => ({...prev, [acc.name]: backendWallet}))}
                                      className="px-2 py-1 text-xs bg-secondary hover:bg-secondary/80 rounded border border-border"
                                      title="Use Backend Wallet"
                                    >
                                      Backend
                                    </button>
                                  )}
                                  {!isSystemProgram && (
                                    <button
                                      onClick={() => handleGenerateAccount(acc.name)}
                                      className="px-2 py-1 text-xs bg-primary text-primary-foreground rounded border border-border"
                                      title="Generate a new keypair for this account"
                                    >
                                      Generate
                                    </button>
                                  )}
                                </div>
                                {shouldAutoGenerateAccount(acc) && (
                                  <p className="text-xs text-muted-foreground">
                                    This account must be new for each run. We auto-generated <span className="font-mono">{generatedKeypairs[acc.name]?.pubkey || "(pending...)"}</span> and will sign it for you.
                                  </p>
                                )}
                                {!shouldAutoGenerateAccount(acc) && generatedKeypairs[acc.name] && (
                                  <span className="text-xs text-green-500 font-mono">Generated signer: {generatedKeypairs[acc.name].pubkey}</span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                    </div>

                      <div className="space-y-4">
                        <h4 className="text-xs font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                          Return Decoder
                        </h4>
                        <div className="space-y-3">
                          {returnLayout.length === 0 && (
                            <p className="text-xs text-muted-foreground">
                              Build a layout to decode return data (numbers are little-endian; strings/bytes expect a u32 length prefix).
                            </p>
                          )}
                          {returnLayout.map((field) => (
                            <div key={field.id} className="flex flex-col gap-2 border border-border/60 rounded-md p-3 bg-background/60">
                              <div className="flex gap-2">
                                <input
                                  value={field.name}
                                  onChange={(e) => handleUpdateReturnField(field.id, { name: e.target.value })}
                                  placeholder="Field name"
                                  className="flex-1 bg-background border border-border rounded-md px-3 py-2 text-sm"
                                />
                                <select
                                  value={field.type}
                                  onChange={(e) => handleUpdateReturnField(field.id, { type: e.target.value as ReturnFieldType })}
                                  className="w-32 bg-background border border-border rounded-md px-2 text-sm"
                                >
                                  {RETURN_FIELD_TYPE_OPTIONS.map((option) => (
                                    <option key={option.value} value={option.value}>
                                      {option.label}
                                    </option>
                                  ))}
                                </select>
                                <button
                                  onClick={() => handleRemoveReturnField(field.id)}
                                  className="px-2 py-1 text-xs bg-destructive/10 text-destructive rounded border border-destructive/30"
                                  title="Remove field"
                                >
                                  Remove
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={handleAddReturnField}
                            className="px-3 py-2 text-xs bg-secondary text-secondary-foreground rounded border border-border"
                          >
                            + Add Field
                          </button>
                          {returnLayout.length > 0 && (
                            <button
                              onClick={handleClearReturnLayout}
                              className="px-3 py-2 text-xs bg-muted text-muted-foreground rounded border border-border"
                            >
                              Clear
                            </button>
                          )}
                        </div>
                      </div>
                </div>

                <div className="p-4 border-t border-border/40 bg-muted/10 space-y-3">
                    <button 
                        onClick={handleSend}
                        disabled={isSending}
                        className={cn(
                            "w-full h-10 rounded-md font-medium text-sm flex items-center justify-center transition-all",
                            isSending ? "bg-muted text-muted-foreground" : "bg-primary text-primary-foreground hover:bg-primary/90"
                        )}
                    >
                        {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send Transaction"}
                    </button>
                    
                    {responseStatus && (
                      <div className="space-y-2">
                        <div className={cn("text-xs text-center font-mono py-2 rounded", responseStatus === 200 ? "text-green-500 bg-green-500/10" : "text-red-500 bg-red-500/10")}>
                          Status: {responseStatus}
                        </div>
                        {responseMessage && (
                          <div className="text-xs text-center font-mono py-2 rounded bg-muted/50 break-all">
                            {responseMessage}
                          </div>
                        )}
                      </div>
                    )}

                    {returnDataInfo && (
                      <div className="text-xs font-mono bg-secondary/20 border border-border rounded p-3 space-y-1 break-all">
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Return Data</div>
                        <div>Program: {returnDataInfo.programId}</div>
                        {returnDataInfo.encoding && <div>Encoding: {returnDataInfo.encoding}</div>}
                        <div>Base64: {returnDataInfo.base64}</div>
                        {returnDataInfo.hex && <div>Hex: {returnDataInfo.hex}</div>}
                        {returnDataInfo.fields?.length ? (
                          <div className="space-y-1 pt-2">
                            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Decoded Fields</div>
                            {returnDataInfo.fields.map((field, idx) => (
                              <div key={`${field.name}-${idx}`} className="flex justify-between gap-4">
                                <span>{field.name} ({field.type})</span>
                                <span className="text-right text-green-500">{field.value}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          returnDataInfo.decoded && (
                            <div className="text-green-500">Decoded (u64): {returnDataInfo.decoded}</div>
                          )
                        )}
                      </div>
                    )}

                    {txLogs.length > 0 && (
                      <div className="text-xs font-mono bg-secondary/10 border border-border rounded p-3 space-y-2 max-h-40 overflow-y-auto">
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Simulation Logs</div>
                        <ul className="space-y-1">
                          {txLogs.map((log, idx) => (
                            <li key={idx} className="break-words">{log}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                </div>
            </motion.div>
        </div>
    );
}