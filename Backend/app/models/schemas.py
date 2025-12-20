from pydantic import BaseModel, Field
from typing import List, Optional, Any, Dict
from enum import Enum


class ChainType(str, Enum):
    SOLANA = "solana"
    ETHEREUM = "ethereum"
    SUI = "sui"
    APTOS = "aptos"
    NEAR = "near"


class DataType(str, Enum):
    U8 = "u8"
    U16 = "u16"
    U32 = "u32"
    U64 = "u64"
    U128 = "u128"
    I8 = "i8"
    I16 = "i16"
    I32 = "i32"
    I64 = "i64"
    I128 = "i128"
    BOOL = "bool"
    PUBKEY = "pubkey"
    STRING = "string"
    BYTES = "bytes"


class LayoutField(BaseModel):
    type: DataType
    value: Any


class PackInstructionRequest(BaseModel):
    layout: List[LayoutField]


class PackInstructionResponse(BaseModel):
    chain: str
    buffer_hex: str
    buffer_base64: str
    length: int


class UnpackInstructionRequest(BaseModel):
    buffer_hex: str
    layout: List[LayoutField]


class UnpackInstructionResponse(BaseModel):
    chain: str
    values: List[Any]


class AccountMeta(BaseModel):
    pubkey: str
    is_signer: bool = False
    is_writable: bool = False


class AdditionalSigner(BaseModel):
    name: str
    secret_key: List[int]


class BuildTransactionRequest(BaseModel):
    rpc_url: Optional[str] = None
    program_id: str
    accounts: List[AccountMeta]
    instruction_data: str = Field(description="Hex or base64 encoded instruction data")
    fee_payer: Optional[str] = None


class BuildTransactionResponse(BaseModel):
    chain: str
    transaction_base64: str
    message_base64: str
    blockhash: str


class SimulateTransactionRequest(BaseModel):
    rpc_url: Optional[str] = None
    transaction_base64: str
    encoding: str = Field(default="base64")


class SimulateTransactionResponse(BaseModel):
    chain: str
    success: bool
    logs: List[str]
    error: Optional[str] = None
    units_consumed: Optional[int] = None
    return_data: Optional[Dict[str, Any]] = None


class SendTransactionRequest(BaseModel):
    rpc_url: Optional[str] = "https://api.testnet.solana.com"
    transaction_base64: Optional[str] = None
    program_id: Optional[str] = None
    accounts: Optional[List[AccountMeta]] = None
    instruction_data: Optional[str] = Field(
        default=None, description="Hex or base64 encoded instruction data"
    )
    fee_payer: Optional[str] = None
    sign_with_backend: bool = Field(
        default=False, description="Sign and send with backend keypair (testnet only)"
    )
    additional_signers: Optional[List[AdditionalSigner]] = None


class SendTransactionResponse(BaseModel):
    chain: str
    signature: str
    success: bool
    error: Optional[str] = None


class IDLInstruction(BaseModel):
    name: str
    discriminator: Optional[List[int]] = None
    accounts: List[Dict[str, Any]]
    args: List[Dict[str, Any]]


class IDLType(BaseModel):
    name: str
    type_def: Dict[str, Any]


class IDLResponse(BaseModel):
    chain: str
    program_id: str
    version: Optional[str] = None
    name: Optional[str] = None
    instructions: Optional[List[IDLInstruction]] = None
    accounts: Optional[List[IDLType]] = None
    types: Optional[List[IDLType]] = None
    events: Optional[List[Dict[str, Any]]] = None
    errors: Optional[List[Dict[str, Any]]] = None
    raw_idl: Dict[str, Any]


class IDLMethodsResponse(BaseModel):
    chain: str
    program_id: str
    methods: List[IDLInstruction]


class ErrorResponse(BaseModel):
    error: str
    detail: Optional[str] = None
    code: Optional[str] = None
    chain: Optional[str] = None


class AccountInfoRequest(BaseModel):
    rpc_url: Optional[str] = None
    pubkey: str
    encoding: str = Field(default="base64")


class AccountInfoResponse(BaseModel):
    chain: str
    pubkey: str
    lamports: int
    owner: str
    executable: bool
    rent_epoch: int
    data: Optional[str] = None
    data_len: int


class ChainInfoResponse(BaseModel):
    chain: str
    name: str
    default_rpc_url: str
    supported_features: List[str]
    data_types: List[str]


class SupportedChainsResponse(BaseModel):
    chains: List[ChainInfoResponse]
