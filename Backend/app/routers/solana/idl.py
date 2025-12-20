from fastapi import APIRouter, HTTPException, Query
from ...chains.solana import SolanaRPCClient, SolanaIDLLoader
from ...models.schemas import IDLResponse, IDLMethodsResponse, ErrorResponse

router = APIRouter(prefix="/idl", tags=["Solana - IDL"])


@router.get(
    "/{program_id}",
    response_model=IDLResponse,
    responses={404: {"model": ErrorResponse}, 500: {"model": ErrorResponse}},
    summary="Fetch Anchor IDL",
    description="Fetch and parse the Anchor IDL for a Solana program"
)
async def get_idl(
    program_id: str,
    rpc_url: str = Query(default=None, description="Solana RPC URL (defaults to mainnet)")
):
    rpc_client = SolanaRPCClient(rpc_url)
    idl_loader = SolanaIDLLoader(rpc_client)
    
    try:
        idl = await idl_loader.fetch_idl(program_id)
        
        if not idl:
            raise HTTPException(
                status_code=404,
                detail=f"No Anchor IDL found for program {program_id}"
            )
        
        instructions = idl_loader.parse_instructions(idl)
        accounts = idl_loader.parse_accounts(idl)
        types = idl_loader.parse_types(idl)
        events = idl_loader.parse_events(idl)
        errors = idl_loader.parse_errors(idl)
        
        return IDLResponse(
            chain="solana",
            program_id=program_id,
            version=idl.get("version"),
            name=idl.get("name"),
            instructions=[
                {
                    "name": ix["name"],
                    "discriminator": ix.get("discriminator"),
                    "accounts": ix["accounts"],
                    "args": ix["args"]
                }
                for ix in instructions
            ],
            accounts=[
                {"name": acc["name"], "type_def": acc.get("type", {})}
                for acc in accounts
            ],
            types=[
                {"name": t["name"], "type_def": t.get("type", {})}
                for t in types
            ],
            events=events,
            errors=errors,
            raw_idl=idl
        )
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error fetching IDL: {str(e)}"
        )
    finally:
        await rpc_client.close()


@router.get(
    "/{program_id}/methods",
    response_model=IDLMethodsResponse,
    responses={404: {"model": ErrorResponse}, 500: {"model": ErrorResponse}},
    summary="Get IDL Methods",
    description="Get list of instruction methods and their argument schemas from a Solana program's IDL"
)
async def get_idl_methods(
    program_id: str,
    rpc_url: str = Query(default=None, description="Solana RPC URL (defaults to mainnet)")
):
    rpc_client = SolanaRPCClient(rpc_url)
    idl_loader = SolanaIDLLoader(rpc_client)
    
    try:
        idl = await idl_loader.fetch_idl(program_id)
        
        if not idl:
            raise HTTPException(
                status_code=404,
                detail=f"No Anchor IDL found for program {program_id}"
            )
        
        instructions = idl_loader.parse_instructions(idl)
        
        return IDLMethodsResponse(
            chain="solana",
            program_id=program_id,
            methods=[
                {
                    "name": ix["name"],
                    "discriminator": ix.get("discriminator"),
                    "accounts": ix["accounts"],
                    "args": ix["args"]
                }
                for ix in instructions
            ]
        )
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error fetching IDL methods, ensure program_id is correct: and idl is enambled/deployed {str(e)}"
        )
    finally:
        await rpc_client.close()
