from typing import Optional
from solders.pubkey import Pubkey
from solders.signature import Signature
from nacl.signing import VerifyKey
from nacl.exceptions import BadSignatureError
import base64


class SolanaWalletConnect:
    """
    Handles Solana wallet connection verification and authentication.
    """

    @staticmethod
    def verify_signature(
        public_key_str: str, message: str, signature_base58: str
    ) -> bool:
        """
        Verifies that a message was signed by the private key corresponding to the public key.

        Args:
            public_key_str: The base58 encoded public key string.
            message: The raw message string that was signed.
            signature_base58: The base58 encoded signature.

        Returns:
            bool: True if signature is valid, False otherwise.
        """
        try:
            # Convert inputs to bytes
            pubkey_bytes = Pubkey.from_string(public_key_str).to_bytes()
            msg_bytes = message.encode("utf-8")

            # Parse signature (solders handles base58 decoding)
            sig_bytes = Signature.from_string(signature_base58).bytes

            # Verify using NaCl (Ed25519)
            verify_key = VerifyKey(pubkey_bytes)
            verify_key.verify(msg_bytes, sig_bytes)
            return True
        except (BadSignatureError, ValueError, Exception) as e:
            # Log error if necessary
            return False


class GlobalWalletConnect:
    """
    Placeholder for Global WalletConnect (v2) integration for scalability.
    """

    pass
