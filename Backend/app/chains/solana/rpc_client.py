from typing import Optional, Dict, Any, List
from ..base.rpc_client import BaseRPCClient


class SolanaRPCClient(BaseRPCClient):
    DEFAULT_RPC_URL = "https://api.devnet.solana.com"

    @classmethod
    def get_default_rpc_url(cls) -> str:
        return cls.DEFAULT_RPC_URL

    async def _request(
        self, method: str, params: Optional[List[Any]] = None
    ) -> Dict[str, Any]:
        payload = {"jsonrpc": "2.0", "id": 1, "method": method, "params": params or []}
        response = await self.client.post(self.rpc_url, json=payload)
        response.raise_for_status()
        result = response.json()
        if "error" in result:
            raise Exception(f"RPC Error: {result['error']}")
        return result.get("result")

    async def get_account_info(
        self, address: str, encoding: str = "base64", **kwargs
    ) -> Optional[Dict[str, Any]]:
        result = await self._request(
            "getAccountInfo", [address, {"encoding": encoding}]
        )
        return result.get("value") if result else None

    async def get_latest_blockhash(self) -> Dict[str, Any]:
        result = await self._request(
            "getLatestBlockhash", [{"commitment": "finalized"}]
        )
        return result["value"]

    async def simulate_transaction(
        self, transaction: str, encoding: str = "base64", **kwargs
    ) -> Dict[str, Any]:
        params = [
            transaction,
            {
                "encoding": encoding,
                "commitment": "processed",
                "replaceRecentBlockhash": True,
                "sigVerify": False,
            },
        ]
        result = await self._request("simulateTransaction", params)
        return result["value"]

    async def send_transaction(
        self, transaction: str, encoding: str = "base64", **kwargs
    ) -> Dict[str, Any]:
        params = [
            transaction,
            {
                "encoding": encoding,
                "preflightCommitment": "confirmed",
                "skipPreflight": False,
            },
        ]
        result = await self._request("sendTransaction", params)
        return result

    async def get_minimum_balance_for_rent_exemption(self, data_len: int) -> int:
        result = await self._request("getMinimumBalanceForRentExemption", [data_len])
        return result

    async def get_slot(self) -> int:
        result = await self._request("getSlot", [])
        return result

    async def get_block_height(self) -> int:
        result = await self._request("getBlockHeight", [])
        return result
