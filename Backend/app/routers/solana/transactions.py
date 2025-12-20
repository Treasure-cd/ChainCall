from fastapi import APIRouter, HTTPException
from ...chains.solana import SolanaRPCClient, SolanaTxBuilder
from ...models.schemas import (
    BuildTransactionRequest,
    BuildTransactionResponse,
    SimulateTransactionRequest,
    SimulateTransactionResponse,
    SendTransactionRequest,
    SendTransactionResponse,
    ErrorResponse,
)
import os
import base64
import logging
import json
import re
from typing import Any, Dict, List, Optional
from solders.keypair import Keypair
from ...core.configs import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/tx", tags=["Solana - Transactions"])


def _extract_contract_error_message(logs: List[str]) -> Optional[str]:
    patterns = [
        re.compile(r"Error Message:\s*(.+)", re.IGNORECASE),
        re.compile(r"Program log:\s*Error:\s*(.+)", re.IGNORECASE),
        re.compile(r"Contract reported:\s*(.+)", re.IGNORECASE),
    ]

    for log in logs:
        for pattern in patterns:
            match = pattern.search(log)
            if match:
                return match.group(1).strip()
    return None


def _extract_contract_error_code(logs: List[str]) -> Optional[str]:
    code_pattern = re.compile(r"Error Code:\s*([A-Za-z0-9_]+)", re.IGNORECASE)
    number_pattern = re.compile(r"Error Number:\s*(\d+)", re.IGNORECASE)

    for log in logs:
        match = code_pattern.search(log)
        if match:
            return match.group(1)
        match = number_pattern.search(log)
        if match:
            return match.group(1)
    return None


def _build_error_detail(
    message: str,
    *,
    logs: Optional[List[str]] = None,
    reason: Optional[str] = None,
    code: Optional[str] = None,
    program_error: Optional[Any] = None,
):
    detail: Dict[str, Any] = {"message": message}
    if reason:
        detail["friendly_error"] = reason
        detail["reason"] = reason
    if logs is not None:
        detail["logs"] = logs
    if code:
        detail["code"] = code
    if program_error is not None:
        detail["program_error"] = program_error
    return detail


def get_backend_keypair() -> Keypair:
    """Load the backend keypair from environment variables."""
    backend_keypair_env = settings.BACKEND_SOLANA_KEYPAIR
    if not backend_keypair_env:
        raise ValueError("BACKEND_SOLANA_KEYPAIR environment variable is not set")

    try:
        # Check if the key is a JSON array (byte list) or a Base58 string
        key_str = backend_keypair_env.strip()
        if key_str.startswith("["):
            # It's a JSON array of bytes
            key_bytes = json.loads(key_str)
            return Keypair.from_bytes(key_bytes)
        else:
            # Assume it's a Base58 string
            return Keypair.from_base58_string(key_str)
    except Exception as e:
        raise ValueError(f"Invalid backend keypair: {str(e)}")


@router.get(
    "/wallet",
    summary="Get Backend Wallet Info",
    description="Get the public key of the backend wallet used for signing",
)
async def get_backend_wallet():
    try:
        keypair = get_backend_keypair()
        return {"pubkey": str(keypair.pubkey())}
    except ValueError as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post(
    "/build",
    response_model=BuildTransactionResponse,
    responses={400: {"model": ErrorResponse}, 500: {"model": ErrorResponse}},
    summary="Build Transaction",
    description="Build an unsigned Solana transaction",
)
async def build_transaction(request: BuildTransactionRequest):
    rpc_client = SolanaRPCClient(request.rpc_url)
    tx_builder = SolanaTxBuilder()

    try:
        blockhash_response = await rpc_client.get_latest_blockhash()
        blockhash = blockhash_response["blockhash"]

        instruction_bytes = tx_builder.decode_instruction_data(request.instruction_data)

        accounts = [
            {
                "pubkey": acc.pubkey,
                "is_signer": acc.is_signer,
                "is_writable": acc.is_writable,
            }
            for acc in request.accounts
        ]

        instruction = tx_builder.build_instruction(
            request.program_id, accounts, instruction_bytes
        )

        fee_payer = request.fee_payer
        if not fee_payer and request.accounts:
            fee_payer = request.accounts[0].pubkey

        if not fee_payer:
            raise ValueError("No fee payer specified and no accounts provided")

        result = await tx_builder.build_transaction([instruction], fee_payer, blockhash)

        return BuildTransactionResponse(
            chain="solana",
            transaction_base64=result["transaction_base64"],
            message_base64=result["message_base64"],
            blockhash=result["blockhash"],
        )

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error building transaction: {str(e)}"
        )
    finally:
        await rpc_client.close()


@router.post(
    "/simulate",
    response_model=SimulateTransactionResponse,
    responses={400: {"model": ErrorResponse}, 500: {"model": ErrorResponse}},
    summary="Simulate Transaction",
    description="Simulate a Solana transaction and get execution logs",
)
async def simulate_transaction(request: SimulateTransactionRequest):
    rpc_client = SolanaRPCClient(request.rpc_url)

    try:
        result = await rpc_client.simulate_transaction(
            request.transaction_base64, request.encoding
        )

        error = result.get("err")
        logs = result.get("logs", [])
        units_consumed = result.get("unitsConsumed")
        return_data = result.get("returnData")

        error_str = None
        if error:
            error_str = str(error) if isinstance(error, dict) else str(error)

        return SimulateTransactionResponse(
            chain="solana",
            success=error is None,
            logs=logs or [],
            error=error_str,
            units_consumed=units_consumed,
            return_data=return_data,
        )

    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error simulating transaction: {str(e)}"
        )
    finally:
        await rpc_client.close()


@router.post(
    "/send",
    response_model=SendTransactionResponse,
    responses={400: {"model": ErrorResponse}, 500: {"model": ErrorResponse}},
    summary="Send Transaction",
    description="Send a signed transaction to the Solana network",
)
async def send_transaction(request: SendTransactionRequest):
    if request.sign_with_backend:
        # Only allow on testnet
        testnet_urls = [
            "https://api.testnet.solana.com",
            "https://api.devnet.solana.com",
        ]
        if request.rpc_url not in testnet_urls:
            raise HTTPException(
                status_code=400,
                detail="Backend signing is only allowed on testnet/devnet",
            )

        # Check required fields for building
        if not all([request.program_id, request.instruction_data]):
            raise HTTPException(
                status_code=400,
                detail="program_id and instruction_data required for backend signing",
            )
        accounts_payload = request.accounts or []

        # Load backend keypair
        try:
            backend_keypair = get_backend_keypair()
            logger.info(
                f"Loaded backend keypair for public key: {backend_keypair.pubkey()}"
            )
        except ValueError as e:
            logger.error(f"Backend keypair error: {str(e)}")
            raise HTTPException(status_code=500, detail=str(e))

        additional_keypairs = []
        if request.additional_signers:
            for signer in request.additional_signers:
                try:
                    if not signer.secret_key:
                        raise ValueError("Missing secret key bytes")
                    kp = Keypair.from_bytes(bytes(signer.secret_key))
                    additional_keypairs.append(kp)
                    logger.info(
                        f"Loaded additional signer '{signer.name}' -> {kp.pubkey()}"
                    )
                except Exception as e:
                    logger.error(
                        f"Invalid additional signer {signer.name}: {str(e)}",
                        exc_info=True,
                    )
                    raise HTTPException(
                        status_code=400,
                        detail=f"Invalid additional signer {signer.name}: {str(e)}",
                    )

        rpc_client = SolanaRPCClient(request.rpc_url)
        tx_builder = SolanaTxBuilder()

        try:
            # Build transaction
            blockhash_response = await rpc_client.get_latest_blockhash()
            blockhash = blockhash_response["blockhash"]

            instruction_bytes = tx_builder.decode_instruction_data(
                request.instruction_data
            )

            accounts = [
                {
                    "pubkey": acc.pubkey,
                    "is_signer": acc.is_signer,
                    "is_writable": acc.is_writable,
                }
                for acc in accounts_payload
            ]

            logger.info(
                f"Building instruction for program {request.program_id} with accounts: {json.dumps(accounts)}"
            )

            instruction = tx_builder.build_instruction(
                request.program_id, accounts, instruction_bytes
            )

            fee_payer = request.fee_payer or str(backend_keypair.pubkey())

            # Build unsigned
            unsigned_result = await tx_builder.build_transaction(
                [instruction], fee_payer, blockhash
            )

            # Sign with backend + any additional signers
            unsigned_tx = unsigned_result["transaction"]
            try:
                # Use partial_sign to allow for cases where backend is one of multiple signers
                # (though sending will fail if others are missing)
                signers = [backend_keypair] + additional_keypairs
                unsigned_tx.partial_sign(signers, unsigned_tx.message.recent_blockhash)
            except ValueError as e:
                if "keypair-pubkey mismatch" in str(e):
                    raise HTTPException(
                        status_code=400,
                        detail=f"Backend wallet {backend_keypair.pubkey()} is not a required signer for this transaction. Please ensure the backend wallet is set as a signer or fee payer.",
                    )
                raise e

            signed_transaction_base64 = base64.b64encode(bytes(unsigned_tx)).decode(
                "utf-8"
            )

        except HTTPException:
            raise
        except ValueError as e:
            logger.error(f"Validation error building transaction: {str(e)}")
            raise HTTPException(
                status_code=400, detail=f"Invalid transaction data: {str(e)}"
            )
        except Exception as e:
            print(f"DEBUG: Build/Sign Error: {e}")
            logger.error(f"Error building/signing transaction: {str(e)}", exc_info=True)
            raise HTTPException(
                status_code=500, detail=f"Error processing transaction: {str(e)}"
            )

    else:
        # Expect signed transaction
        if not request.transaction_base64:
            raise HTTPException(
                status_code=400, detail="transaction_base64 required for sending"
            )

        signed_transaction_base64 = request.transaction_base64
        rpc_client = SolanaRPCClient(request.rpc_url)

    simulation_logs = []
    simulation_return_data = None

    try:
        simulation_result = None
        try:
            simulation_result = await rpc_client.simulate_transaction(
                signed_transaction_base64
            )
        except Exception as sim_err:
            logger.warning(
                f"Unable to simulate transaction before send: {str(sim_err)}",
                exc_info=True,
            )

        if simulation_result:
            simulation_logs = simulation_result.get("logs") or []
            simulation_return_data = simulation_result.get("returnData")
            simulation_error = simulation_result.get("err")

            if simulation_error:
                logger.error(
                    "Simulation failed prior to send: %s | Logs: %s",
                    simulation_error,
                    simulation_logs,
                )
                friendly_error = _extract_contract_error_message(simulation_logs)
                error_code = _extract_contract_error_code(simulation_logs)
                raise HTTPException(
                    status_code=400,
                    detail=_build_error_detail(
                        "Transaction simulation failed",
                        logs=simulation_logs,
                        reason=friendly_error,
                        code=error_code,
                        program_error=simulation_error,
                    ),
                )

        result = await rpc_client.send_transaction(signed_transaction_base64)

        return SendTransactionResponse(
            chain="solana",
            signature=result,
            success=True,
            logs=simulation_logs,
            return_data=simulation_return_data,
        )

    except HTTPException:
        raise
    except Exception as e:
        error_msg = str(e)
        print(f"DEBUG: Transaction Send Error: {error_msg}")

        if (
            "Signature verification failed" in error_msg
            or "Transaction signature verification failure" in error_msg
        ):
            raise HTTPException(
                status_code=400,
                detail=_build_error_detail(
                    "Transaction signature verification failed. Ensure all required signers have signed.",
                    logs=simulation_logs,
                    reason=error_msg,
                ),
            )

        if (
            "Simulation failed" in error_msg
            or "InstructionError" in error_msg
            or "Transaction simulation failed" in error_msg
        ):
            raise HTTPException(
                status_code=400,
                detail=_build_error_detail(
                    "Transaction simulation failed",
                    logs=simulation_logs,
                    reason=error_msg,
                ),
            )

        raise HTTPException(
            status_code=500,
            detail=_build_error_detail(
                "Error sending transaction",
                logs=simulation_logs,
                reason=error_msg,
            ),
        )
    finally:
        await rpc_client.close()
