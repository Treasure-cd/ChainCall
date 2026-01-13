import { useState, useEffect, useCallback } from "react";
import { useConnection } from '@solana/wallet-adapter-react';
import { useWallet } from '../../context/WalletProvider';
import { Plus, Trash2, Copy, Loader2, AlertCircle, Send, Key, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Transaction, VersionedTransaction, PublicKey } from '@solana/web3.js';
import useLocalStorage from "@/hooks/useLocalStorage";

type FieldType = "u8" | "u16" | "u32" | "u64" | "string" | "pubkey";

export interface Field {
  id: string;
  type: FieldType;
  value: string;
}

interface Account {
  id: string;
  pubkey: string;
  is_signer: boolean;
  is_writable: boolean;
}

export default function InstructionBuilder() {
const [fields, setFields] = useLocalStorage<Field[]>('form-fields', [
  { id: "1", type: "u8", value: "1" },
  { id: "2", type: "string", value: "Hello" }
]);
  
  const [bufferHex, setBufferHex] = useState<string>("");
  const [isPacking, setIsPacking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isWalletSendViewOpen, setIsWalletSendViewOpen] = useState(false);
  const [isWalletSendButtonVisible, setIsWalletSendButtonVisible] = useState(true);
    const [programId, setProgramId] = useState("BtcuWYrpxC1fxNwsEaMisFUXqhoSsRgAZU7HtpbxhnBm");
    const [accounts, setAccounts] = useState<Account[]>([
      { id: "1", pubkey: "", is_signer: true, is_writable: true }
    ]);

    const [isSending, setIsSending] = useState(false);
    const [txStatus, setTxStatus] = useState<{
      status: 'idle' | 'success' | 'error';
      message: string;
    }>({ status: 'idle', message: '' });
    const { isConnected, signTransaction, rpcUrl } = useWallet();
    const { connection } = useConnection();
    
  

  const addField = () => {
    setFields([...fields, { id: Math.random().toString(), type: "u8", value: "" }]);
  };

  const removeField = (id: string) => {
    setFields(fields.filter(f => f.id !== id));
  };

  const updateField = (id: string, key: keyof Field, value: string) => {
    setFields(fields.map(f => f.id === id ? { ...f, [key]: value } : f));
  };

    const addAccount = () => {
    setAccounts([...accounts, { 
      id: Math.random().toString(), 
      pubkey: "", 
      is_signer: false, 
      is_writable: false 
    }]);
  };

  const removeAccount = (id: string) => {
    setAccounts(accounts.filter(a => a.id !== id));
  };

  const updateAccount = (id: string, updates: Partial<Account>) => {
    setAccounts(accounts.map(a => a.id === id ? { ...a, ...updates } : a));
  };

  const toggleWalletSendView = () => {
    setIsWalletSendButtonVisible(!isWalletSendButtonVisible);
    setIsWalletSendViewOpen(!isWalletSendViewOpen);
  };

  const packInstruction = useCallback(async () => {
    const validFields = fields.every(f => f.value.trim() !== "");
    if (!validFields) return; 

    setIsPacking(true);
    setError(null);

    try {
      const payload = {
        layout: fields.map(f => {
          if (["u8", "u16", "u32", "u64"].includes(f.type)) {
             const num = Number(f.value);
             return { type: f.type, value: isNaN(num) ? 0 : num };
          }
          return { type: f.type, value: f.value };
        })
      };

      const res = await fetch("https://chaincall.onrender.com/solana/instruction/pack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.detail || data.error || "Failed to pack instruction");
      }

      setBufferHex(data.buffer_hex);

    } catch (err: any) {
      console.error(err);
      setError(err.message || "Error packing data");
    } finally {
      setIsPacking(false);
    }
  }, [fields]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (fields.length > 0) packInstruction();
    }, 500);

    return () => clearTimeout(timer);
  }, [packInstruction, fields]);

    const executeTransaction = async () => {
      if (!isConnected) {
        setTxStatus({ status: 'error', message: 'Please connect your wallet first' });
        return;
      }
  
      if (!bufferHex) {
        setTxStatus({ status: 'error', message: 'No instruction data packed yet' });
        return;
      }
  
      if (!programId) {
        setTxStatus({ status: 'error', message: 'Program ID is required' });
        return;
      }
  
      if (accounts.length === 0 || !accounts[0].pubkey) {
        setTxStatus({ status: 'error', message: 'At least one account is required' });
        return;
      }
  
      setIsSending(true);
      setTxStatus({ status: 'idle', message: '' });
  
      try {
  
        const baseUrl = "https://chaincall.onrender.com";
        const buildResponse = await fetch(`${baseUrl}/solana/tx/build`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rpc_url: rpcUrl,
            program_id: programId,
            accounts: accounts.map(a => ({
              pubkey: a.pubkey,
              is_signer: a.is_signer,
              is_writable: a.is_writable,
            })),
            instruction_data: bufferHex,
            fee_payer: accounts[0].pubkey,
          }),
        });
  
        if (!buildResponse.ok) {
          const error = await buildResponse.json();
          throw new Error(error.detail || 'Failed to build transaction');
        }
  
        const { transaction_base64 } = await buildResponse.json();
  
        // Step 2: Deserialize transaction
        const txBuffer = Buffer.from(transaction_base64, 'base64');
        let transaction: Transaction | VersionedTransaction;
  
        try {
          transaction = VersionedTransaction.deserialize(txBuffer);
        } catch {
          transaction = Transaction.from(txBuffer);
        }
  
        // Step 3: Sign with wallet
        const signedTx = await signTransaction(transaction);
  
        // Step 4: Send to network
        const signature = await connection.sendRawTransaction(
          signedTx.serialize()
        );
  
        // Step 5: Confirm
        await connection.confirmTransaction(signature, 'confirmed');
  
        setTxStatus({ 
          status: 'success', 
          message: `Transaction successful! Signature: ${signature}` 
        });
  
      } catch (err: any) {
        console.error('Transaction failed:', err);
        setTxStatus({ 
          status: 'error', 
          message: err.message || 'Transaction failed' 
        });
      } finally {
        setIsSending(false);
      }
    };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        
        {/* Instruction Builder Section */}
        <div className="mb-8">
          <div className="mb-4">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Instruction Builder</h2>
            <p className="text-muted-foreground mt-1">Manually pack bytes for raw instructions.</p>
          </div>

          <div className="bg-card border border-border rounded-lg shadow-sm overflow-hidden">
            <div className="p-4 border-b border-border flex items-center justify-between bg-muted/30">
              <span className="font-mono text-sm font-medium">Byte Layout</span>
              <button 
                onClick={addField}
                className="flex items-center gap-2 text-xs bg-primary/10 text-primary px-3 py-1.5 rounded-md hover:bg-primary/20 transition-colors"
              >
                <Plus className="h-3 w-3" />
                Add Field
              </button>
            </div>

            <div className="p-4 space-y-2 max-h-[400px] overflow-y-auto">
              {fields.map((field, index) => (
                <div key={field.id} className="group flex items-start gap-2">
                  <div className="flex flex-col items-center pt-2 gap-1">
                    <div className="w-6 h-6 rounded-full bg-accent text-muted-foreground text-xs flex items-center justify-center font-mono">
                      {index}
                    </div>
                    {index < fields.length - 1 && <div className="w-px h-full bg-border" />}
                  </div>
                  
                  <div className="flex-1 grid grid-cols-12 gap-2 bg-secondary/30 p-3 rounded-md border border-transparent group-hover:border-border transition-colors">
                    <select 
                      value={field.type}
                      onChange={(e) => updateField(field.id, "type", e.target.value as FieldType)}
                      className="col-span-3 sm:col-span-3 bg-background border border-border rounded px-2 py-1.5 text-sm font-mono outline-none focus:ring-1 focus:ring-primary"
                    >
                      <option value="u8">u8</option>
                      <option value="u16">u16</option>
                      <option value="u32">u32</option>
                      <option value="u64">u64</option>
                      <option value="string">string</option>
                      <option value="pubkey">Pubkey</option>
                    </select>
                    
                    <input 
                      value={field.value}
                      onChange={(e) => updateField(field.id, "value", e.target.value)}
                      placeholder="Value"
                      className="col-span-8 sm:col-span-8 bg-background border border-border rounded px-3 py-1.5 text-sm font-mono outline-none focus:ring-1 focus:ring-primary"
                    />

                    <button 
                      onClick={() => removeField(field.id)}
                      className="col-span-1 flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Output Buffer Section */}
        <div className="mb-8">
          <div className="mb-4">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Output Buffer</h2>
            <p className="text-muted-foreground mt-1">Real-time hex view of your instruction data.</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Hex Display */}
            <div className="lg:col-span-2 bg-black border border-border rounded-lg p-4 font-mono text-sm min-h-[200px] relative overflow-hidden">
              <div className="absolute top-4 right-4 flex gap-2 z-10">
                {isPacking && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                <button 
                  onClick={() => navigator.clipboard.writeText(bufferHex)}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  title="Copy Hex"
                  disabled={!bufferHex}
                >
                  <Copy className="h-4 w-4" />
                </button>
              </div>

              <div className="break-all leading-relaxed tracking-wide text-green-400/90 pr-12 max-h-[300px] overflow-y-auto">
                {error ? (
                  <span className="text-red-400 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4" /> {error}
                  </span>
                ) : (
                  bufferHex || <span className="text-muted-foreground opacity-50">No data yet...</span>
                )}
              </div>
            </div>

            {/* Summary Stats */}
            <div className="bg-accent/10 border border-accent/20 rounded-lg p-4">
              <h4 className="font-semibold text-foreground mb-3">Summary</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Total Bytes:</span>
                  <span className="font-mono bg-background px-2 py-1 rounded border border-border/50 font-medium">
                    {bufferHex ? bufferHex.length / 2 : 0}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Fields:</span>
                  <span className="font-mono bg-background px-2 py-1 rounded border border-border/50 font-medium">
                    {fields.length}
                  </span>
                </div>
              </div>
            </div>
      {isWalletSendButtonVisible && isConnected && <Button 
          variant="secondary" 
          size="lg"
          className="gap-2"
          onClick={toggleWalletSendView}
        >
          Send Transaction to Wallet
          <Send className="h-4 w-4" />
        </Button>}

        
          </div>
        </div>

        {/* STEP 2 & 3: Wallet Integration (Collapsible) */}
        {isWalletSendViewOpen && (
          <>
    {/* STEP 2: Program & Accounts */}
        <div className="mb-8">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Configure Transaction</h2>
            </div>
            <button
              onClick={toggleWalletSendView}
              className="text-muted-foreground hover:text-foreground transition-colors p-2"
              title="Collapse"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Program ID */}
          <div className="mb-4">
            <label className="text-sm font-medium mb-2 block">Program ID</label>
            <input
              value={programId}
              onChange={(e) => setProgramId(e.target.value)}
              placeholder="Program Public Key"
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Accounts */}
          <div className="bg-card border border-border rounded-lg shadow-sm overflow-hidden">
            <div className="p-4 border-b border-border flex items-center justify-between bg-muted/30">
              <span className="font-mono text-sm font-medium flex items-center gap-2">
                <Key className="h-4 w-4" />
                Accounts
              </span>
              <button 
                onClick={addAccount}
                className="flex items-center gap-2 text-xs bg-primary/10 text-primary px-3 py-1.5 rounded-md hover:bg-primary/20 transition-colors"
              >
                <Plus className="h-3 w-3" />
                Add Account
              </button>
            </div>

            <div className="p-4 space-y-3">
              {accounts.map((account, index) => (
                <div key={account.id} className="bg-secondary/30 p-3 rounded-md border border-border/50 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-muted-foreground">Account {index}</span>
                    <button 
                      onClick={() => removeAccount(account.id)}
                      className="ml-auto text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                  
                  <input
                    value={account.pubkey}
                    onChange={(e) => updateAccount(account.id, { pubkey: e.target.value })}
                    placeholder="Public Key"
                    className="w-full bg-background border border-border rounded px-3 py-2 text-sm font-mono outline-none focus:ring-1 focus:ring-primary"
                  />

                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={account.is_signer}
                        onChange={(e) => updateAccount(account.id, { is_signer: e.target.checked })}
                        className="rounded"
                      />
                      Is Signer
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={account.is_writable}
                        onChange={(e) => updateAccount(account.id, { is_writable: e.target.checked })}
                        className="rounded"
                      />
                      Is Writable
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* STEP 3: Execute */}
        <div className="mb-8">
          <div className="mb-4">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Execute Transaction</h2>
          </div>

          <button
            onClick={executeTransaction}
            disabled={!isConnected || !bufferHex || isSending}
            className={cn(
              "w-full px-6 py-3 rounded-lg font-medium flex items-center justify-center gap-2 transition-all",
              !isConnected || !bufferHex || isSending
                ? "bg-muted text-muted-foreground cursor-not-allowed"
                : "bg-primary text-primary-foreground hover:bg-primary/90"
            )}
          >
            {isSending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                Build, Sign & Execute
              </>
            )}
          </button>

          {!isConnected && (
            <div className="mt-3 p-3 bg-yellow-100 text-yellow-700 rounded-lg text-sm">
              ⚠️ Connect your wallet to execute transactions
            </div>
          )}

          {txStatus.status !== 'idle' && (
            <div className={cn(
              "mt-3 p-3 rounded-lg text-sm",
              txStatus.status === 'success' ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
            )}>
              {txStatus.message}
            </div>
          )}
        </div>
          </>
        )}

      </div>


    </div>
  );
}