import { useState, useEffect } from "react";
import { Search, Loader2, Play, Box, Key, X, ArrowRight, Wallet, Activity } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { PublicKey, Keypair } from "@solana/web3.js";
import { sha256 } from "js-sha256";

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

import { Buffer } from 'buffer';

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

export default function AnchorMode() {
  const [programId, setProgramId] = useState("");
  const [network, setNetwork] = useState("mainnet");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [idl, setIdl] = useState<FetchedIdl | null>(null);
  const [selectedInstruction, setSelectedInstruction] = useState<IdlInstruction | null>(null);

  const isValidProgramId = (value: string) => {
    try { new PublicKey(value); return true; } catch { return false; }
  };
  const isProgramIdValid = isValidProgramId(programId);

  const handleFetchIdl = async () => {
    setIsLoading(true);
    setIdl(null);
    setError(null);

    try {
      const rpcUrl = network === "mainnet" 
        ? "https://api.mainnet-beta.solana.com" 
        : "https://api.devnet.solana.com";

      const baseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
      const res = await fetch(`${baseUrl}/solana/idl/${programId}/methods?rpc_url=${encodeURIComponent(rpcUrl)}`);
      
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

          <div className="flex gap-4 items-end">
            <div className="w-32 space-y-2">
              <label className="text-xs font-mono uppercase tracking-wider text-muted-foreground/80">Network</label>
              <div className="relative">
                <select 
                  value={network}
                  onChange={(e) => setNetwork(e.target.value)}
                  className="w-full bg-background/50 border border-border/50 rounded-lg py-3 px-3 font-mono text-sm focus:ring-1 focus:ring-primary/50 outline-none transition-all shadow-sm appearance-none cursor-pointer"
                >
                  <option value="mainnet">Mainnet</option>
                  <option value="devnet">Devnet</option>
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground">
                  <svg width="10" height="6" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
              </div>
            </div>

            <div className="flex-1 space-y-2">
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
                "px-6 py-3 rounded-lg font-medium text-sm flex items-center gap-2 transition-all shadow-sm",
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
        <div className="border border-border/40 rounded-xl overflow-hidden bg-card/30 backdrop-blur-sm shadow-sm">
          {error && (
            <div className="p-4 bg-destructive/10 text-destructive text-sm border-b border-destructive/20 flex items-center gap-2">
              <Activity className="h-4 w-4" />
              {error}
            </div>
          )}
          <table className="w-full text-sm text-left">
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
    
    const [argValues, setArgValues] = useState<Record<string, string>>({});
    const [accountValues, setAccountValues] = useState<Record<string, string>>({});
    const [backendWallet, setBackendWallet] = useState<string | null>(null);
    const [generatedKeypairs, setGeneratedKeypairs] = useState<Record<string, { pubkey: string; secret_key: number[] }>>({});

    useEffect(() => {
      setArgValues({});
      setAccountValues({});
      setGeneratedKeypairs({});
    }, [instruction.name]);

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
      const keypair = Keypair.generate();
      const pubkey = keypair.publicKey.toBase58();
      const secret_key = Array.from(keypair.secretKey);

      setGeneratedKeypairs((prev) => ({
        ...prev,
        [accountName]: { pubkey, secret_key },
      }));

      setAccountValues((prev) => ({
        ...prev,
        [accountName]: pubkey,
      }));
    };

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

    const handleSend = async () => {
        setIsSending(true);
        setResponseStatus(null);
        setResponseMessage("");

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
                
                let typeName = '';
                if (typeof arg.type === 'string') {
                    typeName = arg.type;
                } else if (typeof arg.type === 'object' && arg.type !== null) {
                    // Simple handling for complex types - just to identify them
                    if ('defined' in arg.type) typeName = 'defined';
                    else if ('vec' in arg.type) typeName = 'vec';
                    else if ('option' in arg.type) typeName = 'option';
                    else if ('array' in arg.type) typeName = 'array';
                    else typeName = 'unknown';
                }
                
                console.log(`Processing arg ${arg.name} of type`, arg.type, `(treated as ${typeName}) with value:`, value);

                if (typeName === 'u64' || typeName === 'u128' || typeName === 'i64' || typeName === 'i128') {
                    const bn = BigInt(value || '0');
                    if (typeName.startsWith('u')) argsBuffer.writeBigUInt64LE(bn, offset);
                    else argsBuffer.writeBigInt64LE(bn, offset);
                    offset += 8;
                } else if (typeName === 'u32' || typeName === 'i32') {
                    const val = parseInt(value || '0');
                    if (typeName.startsWith('u')) argsBuffer.writeUInt32LE(val, offset);
                    else argsBuffer.writeInt32LE(val, offset);
                    offset += 4;
                } else if (typeName === 'u16' || typeName === 'i16') {
                    const val = parseInt(value || '0');
                    if (typeName.startsWith('u')) argsBuffer.writeUInt16LE(val, offset);
                    else argsBuffer.writeInt16LE(val, offset);
                    offset += 2;
                } else if (typeName === 'u8' || typeName === 'i8') {
                    const val = parseInt(value || '0');
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
                    argsBuffer.writeUInt8(value === 'true' ? 1 : 0, offset);
                    offset += 1;
                } else if (typeName === 'publicKey' || typeName === 'PublicKey') {
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
                rpc_url: network === "mainnet" 
                    ? "https://api.mainnet-beta.solana.com" 
                    : "https://api.devnet.solana.com",
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
            const json = await res.json();

            if (res.ok) {
                setResponseMessage(json.signature || "Transaction sent successfully!");
            } else {
                setResponseMessage(json.error || `Error: ${res.status}`);
            }

        } catch (error: any) {
            setResponseStatus(500);
            setResponseMessage(error.message || "Failed to send transaction");
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
                             <h4 className="text-xs font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                                Variables (Arguments)
                             </h4>
                             <div className="grid gap-3">
                                {instruction.args.map((arg, i) => (
                                    <div key={i} className="flex flex-col space-y-1.5">
                                        <label className="text-sm font-medium flex justify-between">
                                            {arg.name}
                                            <span className="text-xs text-muted-foreground font-mono">
                                                {typeof arg.type === 'string' ? arg.type : 'custom'}
                                            </span>
                                        </label>
                                        <input 
                                            value={argValues[arg.name] || ""}
                                            onChange={(e) => setArgValues(prev => ({...prev, [arg.name]: e.target.value}))}
                                            placeholder={`Value for ${arg.name}`}
                                            className="bg-background border border-border rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-primary/50 outline-none"
                                        />
                                    </div>
                                ))}
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
                                {generatedKeypairs[acc.name] && (
                                  <span className="text-xs text-green-500 font-mono">Generated signer: {generatedKeypairs[acc.name].pubkey}</span>
                                )}
                              </div>
                            );
                          })}
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
                </div>
            </motion.div>
        </div>
    );
}