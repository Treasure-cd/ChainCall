# ChainCall

A multi-chain smart contract interaction tool for blockchain program introspection, IDL parsing, transaction building, and simulation. Currently supports Solana with an extensible architecture for adding other chains.

## Features

- **Anchor Auto-Magician**: Automatically fetch Anchor IDL for Solana programs and generate a UI for interacting with program methods
- **Instruction Builder**: Manually pack bytes for raw instructions using supported data types
- **Transaction Simulator**: Dry-run transactions against the current network state and view execution logs
- **Multi-Chain Ready**: Extensible architecture designed to support Ethereum, Sui, Aptos, and NEAR in the future

## Tech Stack

### Backend
- **FastAPI** - Python async API framework
- **Solana/Solders** - Solana blockchain interaction
- **AnchorPy** - Anchor IDL parsing and instruction building
- **Pydantic** - Data validation and serialization

### Frontend
- **React 19** - UI framework
- **TypeScript** - Type-safe development
- **Vite** - Build tool and dev server
- **TailwindCSS** - Styling
- **Radix UI** - Accessible component primitives
- **Framer Motion** - Animations
- **TanStack Query** - Data fetching and caching

## Project Structure

```
ChainCall/
├── Backend/
│   ├── backend/
│   │   └── app/
│   │       ├── chains/           # Chain implementations
│   │       │   ├── base/         # Base interfaces for all chains
│   │       │   ├── solana/       # Solana-specific implementation
│   │       │   └── registry.py   # Chain registry for multi-chain support
│   │       ├── models/
│   │       │   └── schemas.py    # Pydantic models
│   │       ├── routers/
│   │       │   └── solana/       # Solana API endpoints
│   │       └── main.py           # FastAPI application
│   └── pyproject.toml            # Python dependencies
└── Frontend/
    ├── client/
    │   └── src/
    │       ├── components/       # UI components
    │       ├── pages/            # Application pages
    │       └── lib/              # Utilities and helpers
    ├── server/                   # Express server
    └── package.json              # Node dependencies
```

## API Endpoints

### Info
- `GET /` - Root endpoint with available endpoints info
- `GET /health` - Health check
- `GET /chains` - List supported chains

### Solana IDL
- `GET /solana/idl/{program_id}` - Fetch Anchor IDL for a program
- `GET /solana/idl/{program_id}/methods` - Get instruction methods from IDL

### Solana Instructions
- `POST /solana/instruction/pack` - Pack instruction data using byte layout
- `GET /solana/instruction/types` - Get supported data types

### Solana Transactions
- `POST /solana/tx/build` - Build an unsigned transaction
- `POST /solana/tx/simulate` - Simulate a transaction

### Solana Accounts
- `POST /solana/accounts/info` - Get account information

## Supported Data Types

For instruction packing:
- Unsigned integers: `u8`, `u16`, `u32`, `u64`, `u128`
- Signed integers: `i8`, `i16`, `i32`, `i64`, `i128`
- Other: `bool`, `pubkey`, `string`, `bytes`

## Getting Started

### Backend Setup

```bash
cd Backend

# Using pip
pip install -r backend/requirements.txt

# Or using uv (recommended)
uv sync

# Run the backend
uvicorn backend.app.main:app --reload --port 8000
```

### Frontend Setup

```bash
cd Frontend
npm install

# Development
npm run dev

# Production build
npm run build
npm start
```

## API Documentation

When the backend is running, interactive API documentation is available at:
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

## Future Roadmap

- [ ] Ethereum/EVM chain implementation
- [ ] Sui chain implementation
- [ ] Aptos chain implementation
- [ ] NEAR chain implementation
- [ ] Batch transaction building
- [ ] Rate limiting and caching
- [ ] Additional data type support (vec, struct)

## License

MIT
