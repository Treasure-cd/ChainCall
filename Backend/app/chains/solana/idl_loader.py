from http import client
import json
import zlib
import base64
import hashlib
from typing import Optional, Dict, Any, List, Tuple
from solders.pubkey import Pubkey
from solana.rpc.async_api import AsyncClient
from ..base.idl_loader import BaseIDLLoader
from .rpc_client import SolanaRPCClient
from anchorpy.provider import Provider, Wallet
from anchorpy.program.core import Program
from anchorpy import Idl


ANCHOR_IDL_SEED = b"anchor:idl"
ANCHOR_DISCRIMINATOR_SIZE = 8


def get_idl_address(program_id: str) -> Tuple[Pubkey, int]:
    program_pubkey = Pubkey.from_string(program_id)
    seeds = [ANCHOR_IDL_SEED]
    return Pubkey.find_program_address(seeds, program_pubkey)


def compute_discriminator(name: str, prefix: str = "global") -> bytes:
    preimage = f"{prefix}:{name}"
    return hashlib.sha256(preimage.encode()).digest()[:8]


class SolanaIDLLoader(BaseIDLLoader):
    def __init__(self, rpc_client: SolanaRPCClient):
        self.rpc_client = rpc_client
        self.rpc_url = rpc_client.rpc_url

    async def fetch_idl(self, program_id: str):
        client = AsyncClient(self.rpc_url)
        provider = Provider(client, Wallet.dummy())
        idl = await Program.fetch_idl(Pubkey.from_string(program_id), provider)

        return json.loads(idl.to_json()) if idl else None

    async def get_idl_with_fallback(
        self, program_id: str, idl_content: Optional[Dict[str, Any]] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Returns the IDL from the provided content if available, otherwise fetches it from the chain.
        """
        if idl_content:
            return idl_content
        return await self.fetch_idl(program_id)

    def get_program(self, program_id: str, idl_dict: Dict[str, Any]) -> Program:
        """
        Constructs an Anchor Program instance from a provided IDL dictionary.
        """
        idl = Idl.from_json(json.dumps(idl_dict))
        client = AsyncClient(self.rpc_url)
        provider = Provider(client, Wallet.dummy())
        return Program(idl, Pubkey.from_string(program_id), provider)

    def parse_instructions(self, idl: Dict[str, Any]) -> List[Dict[str, Any]]:
        instructions = idl.get("instructions", [])
        parsed = []

        for ix in instructions:
            name = ix.get("name", "unknown")
            discriminator = ix.get("discriminator")

            if not discriminator:
                disc_bytes = compute_discriminator(name)
                discriminator = list(disc_bytes)

            accounts = []
            for acc in ix.get("accounts", []):
                accounts.append(
                    {
                        "name": acc.get("name", "unknown"),
                        "isMut": acc.get("isMut", acc.get("writable", False)),
                        "isSigner": acc.get("isSigner", acc.get("signer", False)),
                        "docs": acc.get("docs", []),
                        "optional": acc.get("optional", acc.get("isOptional", False)),
                    }
                )

            args = []
            for arg in ix.get("args", []):
                args.append(
                    {
                        "name": arg.get("name", "unknown"),
                        "type": self._serialize_type(arg.get("type")),
                    }
                )

            parsed.append(
                {
                    "name": name,
                    "discriminator": discriminator,
                    "accounts": accounts,
                    "args": args,
                    "docs": ix.get("docs", []),
                }
            )

        return parsed

    def parse_types(self, idl: Dict[str, Any]) -> List[Dict[str, Any]]:
        types = idl.get("types", [])
        parsed = []

        for t in types:
            parsed.append({"name": t.get("name", "unknown"), "type": t.get("type")})

        return parsed

    def parse_accounts(self, idl: Dict[str, Any]) -> List[Dict[str, Any]]:
        accounts = idl.get("accounts", [])
        parsed = []

        for acc in accounts:
            parsed.append(
                {
                    "name": acc.get("name", "unknown"),
                    "discriminator": acc.get("discriminator"),
                    "type": acc.get("type"),
                }
            )

        return parsed

    def parse_events(self, idl: Dict[str, Any]) -> List[Dict[str, Any]]:
        return idl.get("events", [])

    def parse_errors(self, idl: Dict[str, Any]) -> List[Dict[str, Any]]:
        return idl.get("errors", [])

    def get_instruction_schema(
        self, idl: Dict[str, Any], instruction_name: str
    ) -> Optional[Dict[str, Any]]:
        instructions = self.parse_instructions(idl)
        for ix in instructions:
            if ix["name"] == instruction_name:
                return ix
        return None

    def _serialize_type(self, type_def: Any) -> Any:
        if isinstance(type_def, str):
            return type_def

        if isinstance(type_def, dict):
            if "vec" in type_def:
                return {"vec": self._serialize_type(type_def["vec"])}
            if "option" in type_def:
                return {"option": self._serialize_type(type_def["option"])}
            if "array" in type_def:
                arr = type_def["array"]
                return {"array": [self._serialize_type(arr[0]), arr[1]]}
            if "defined" in type_def:
                return {"defined": type_def["defined"]}
            if "coption" in type_def:
                return {"coption": self._serialize_type(type_def["coption"])}
            return type_def

        return str(type_def)
