# ImpactD122 - Print Brokerage Management System

Full-stack print brokerage management application with AI-powered spec parsing, PO processing, and document generation.

## Features

- 🤖 **AI-Powered Automation** - Gemini AI for parsing print specs and purchase orders
- 📄 **PDF Generation** - Professional quotes, invoices, and vendor POs
- 📊 **Job Management** - Complete workflow from quote to payment
- 👥 **Customer & Vendor Management** - Track relationships and contacts
- 💰 **Dual Pricing Models** - Support for partner and standard vendor pricing
- 📧 **Email Draft Generation** - AI-assisted professional emails

## Tech Stack

**Frontend:**
- React 19 + TypeScript
- Vite
- Tailwind CSS (via CDN)
- Lucide Icons

**Backend:**
- Node.js + Express
- TypeScript
- Prisma ORM
- PostgreSQL
- Google Gemini AI
- jsPDF for document generation

## Prerequisites

- Node.js 18+
- PostgreSQL 16
- Google Gemini API key

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Database

Start PostgreSQL (if using Homebrew):
```bash
brew services start postgresql@16
```

Create database:
```bash
createdb impactd122
```

### 3. Environment Variables

Create `server/.env` with:
```bash
DATABASE_URL="postgresql://YOUR_USERNAME@localhost:5432/impactd122"
GEMINI_API_KEY="your_gemini_api_key_here"
PORT=3001
NODE_ENV="development"
```

### 4. Initialize Database

```bash
# Generate Prisma client
npm run db:generate

# Push schema to database
npm run db:push

# Seed with sample data
npm run db:seed
```

### 5. Run Development Servers

**Option 1: Run both servers concurrently**
```bash
npm run dev
```

**Option 2: Run separately**
```bash
# Terminal 1 - Backend API (port 3001)
npm run dev:server

# Terminal 2 - Frontend (port 3000)
npm run dev:client
```

The application will be available at:
- Frontend: http://localhost:3000
- Backend API: http://localhost:3001

## Project Structure

```
ImpactD122/
├── client/               # Frontend React app
│   ├── lib/             # API client
│   ├── components/      # UI components
│   ├── services/        # Business logic
│   ├── App.tsx          # Main application
│   └── types.ts         # TypeScript definitions
├── server/              # Backend Express API
│   ├── src/
│   │   ├── controllers/ # Route controllers
│   │   ├── routes/      # API routes
│   │   ├── services/    # Business logic (AI, PDF)
│   │   ├── middleware/  # Express middleware
│   │   ├── utils/       # Utilities (Prisma)
│   │   └── index.ts     # Server entry
│   ├── prisma/
│   │   └── schema.prisma # Database schema
│   └── uploads/         # File uploads directory
└── package.json         # Workspace configuration
```

## API Endpoints

### Jobs
- `GET /api/jobs` - Get all jobs
- `GET /api/jobs/:id` - Get single job
- `POST /api/jobs` - Create job
- `PUT /api/jobs/:id` - Update job
- `DELETE /api/jobs/:id` - Delete job
- `PATCH /api/jobs/:id/status` - Update job status
- `PATCH /api/jobs/:id/lock` - Toggle job lock

### Entities (Customers/Vendors)
- `GET /api/entities?type=CUSTOMER|VENDOR` - Get all entities
- `GET /api/entities/:id` - Get single entity
- `POST /api/entities` - Create entity
- `PUT /api/entities/:id` - Update entity
- `DELETE /api/entities/:id` - Delete entity

### AI Services
- `POST /api/ai/parse-specs` - Parse print specs from text
- `POST /api/ai/parse-po` - Parse purchase order document
- `POST /api/ai/generate-email` - Generate email draft

### PDF Generation
- `GET /api/pdf/quote/:jobId` - Generate quote PDF
- `GET /api/pdf/invoice/:jobId` - Generate invoice PDF
- `GET /api/pdf/vendor-po/:jobId` - Generate vendor PO PDF

## Database Management

```bash
# Open Prisma Studio (visual database editor)
npm run db:studio

# Reset and reseed database
npm run db:push
npm run db:seed
```

## Deployment to Railway

### 1. Install Railway CLI

```bash
npm install -g @railway/cli
```

### 2. Login to Railway

```bash
railway login
```

### 3. Initialize Project

```bash
railway init
```

### 4. Add PostgreSQL

```bash
railway add postgresql
```

### 5. Set Environment Variables

```bash
railway variables set GEMINI_API_KEY=your_key_here
railway variables set NODE_ENV=production
```

### 6. Deploy

```bash
railway up
```

The `DATABASE_URL` will be automatically set by Railway's PostgreSQL plugin.

## Workflow

1. **Create Job** - Start with draft job
2. **Parse Specs** - Use AI to parse customer requirements
3. **Upload PO** - Parse customer purchase order
4. **Generate Quote** - Create professional quote PDF
5. **Approve** - Mark job as approved
6. **Issue PO** - Generate vendor purchase order
7. **Track Production** - Update status through production
8. **Invoice** - Generate and send invoice
9. **Mark Paid** - Complete the workflow

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `GEMINI_API_KEY` | Yes | Google Gemini API key |
| `PORT` | No | Server port (default: 3001) |
| `NODE_ENV` | No | Environment (development/production) |

## Troubleshooting

**Port already in use:**
```bash
# Find and kill process on port 3001
lsof -i :3001
kill -9 <PID>
```

**Database connection issues:**
```bash
# Check PostgreSQL is running
brew services list

# Restart PostgreSQL
brew services restart postgresql@16
```

**Prisma client out of sync:**
```bash
npm run db:generate
```

## License

MIT
