# QABS Unified Platform & Master Template (منصة قبس الرقمية المتكاملة)

A production-grade, bilingual (Arabic RTL & English LTR) unified master template and interactive platform for **QABS | قبس الرقمية**, uniting public digital services showcase, customer portal, super admin master dashboard, US/UK corporate formation gateways, multi-store builder, AI business tools, and business banking integration hubs.

### User Review & Critical Decisions

> [!IMPORTANT]
> The following architectural decisions have been aligned based on your direct input:
> - **Unified Portal Architecture**: The app will launch directly into an integrated workspace featuring an instant multi-mode switcher (`Landing Showcase` | `Client Merchant Portal` | `Super Admin Master Control` | `GitHub Template Center`).
> - **Executive Visual Identity**: Deep Navy Blue (`#002433` / `#0B1924`) canvas paired with warm refined Gold (`#D4AF37` / `#C59B27`) accents and authentic QABS teal hues (`#00A389`), utilizing the official QABS brand mark located at `/public/assets/aistudio/qabas-logo_884164c8.png`.
> - **Comprehensive All-in-One Service Hub**: A centralized command interface covering all services (US/UK LLC & LTD formation, EIN & registered agent, multi-store e-commerce, banking sandbox, AI assistant, billing & compliance).
> - **Zero-Risk Sandbox Environment**: All payment gateways, formation filings, and Shopify/Cloudflare connections operate in isolated sandbox modes with zero external leaks or real financial transactions.

---

### 1. Overview & Core Concept

- **What It Does**: QABS is an all-in-one digital operating system for modern Arab and international entrepreneurs. It enables founders to establish US (Delaware/Wyoming) and UK companies, manage compliance, launch multi-tenant e-commerce stores, configure payment and banking gateways (Stripe/Mercury/Wise sandbox), generate AI marketing and business assets, and administer users, tickets, and multi-tier subscriptions.
- **Target Audience / Persona**: E-commerce entrepreneurs, cross-border traders, agencies, digital product creators, and enterprise operations managers seeking a unified command center.
- **Key Value**: Eliminates fragmentation between company formation, international banking setup, store deployment, and day-to-day CRM and analytics into one cohesive Arabic/English workspace.

---

### 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Mode Switcher Bar**: Top sticky executive switch allowing instant switching between:
     - **Showcase / Landing** (`qabs1.store` presentation): Hero, corporate formation offerings, multi-store solutions, AI capabilities, and interactive pricing calculator.
     - **Customer & Merchant Portal** (`portal.qabs1.store`): Overview KPI cards, active store manager, formation filing tracker, bank account statuses, AI business studio, and support tickets.
     - **Super Admin Master Console** (`studio#/home`): Tenant isolation monitor, staff role management, revenue ledger, company formation approval pipeline, store provisioning, and system audit logs.
     - **GitHub Template & Docs Center**: Full architectural breakdown of `QABS-UNIFIED-PLATFORM-TEMPLATE`, module folder structure, database schema, and deployment scripts.
  2. **Formation Gateway Wizard**: Step-by-step interactive filing simulator for US LLC (Delaware / Wyoming) & UK LTD, EIN generation, Articles of Organization preview, and annual compliance calendar.
  3. **Multi-Store & E-Commerce Hub**: Product catalog manager, inventory tracker, order fulfillment simulator, supplier importer, and checkout preview.
  4. **AI Business Studio**: Prompt and workflow engine for automated product descriptions, marketing campaigns, and formation legal advisory.
  5. **Bilingual RTL/LTR Engine**: Dynamic real-time toggle between Arabic (العربية - RTL with Cairo/Tajawal typography) and English (LTR with Plus Jakarta Sans & JetBrains Mono for figures).

- **Visual Identity & Theme**:
  - *Dominant Canvas (60%)*: Deep Luxury Navy (`#03131D` dark mode / `#F8FAFC` light mode).
  - *Structural Surfaces (30%)*: Midnight Navy Slate (`#082030` dark mode / `#FFFFFF` light mode with `#E2E8F0` hairline borders).
  - *Accent Budget (10%)*: Polished Executive Gold (`#D4AF37`) and QABS Signature Teal (`#00A389`).
  - *Typography*: `Cairo` and `Plus Jakarta Sans` for titles and body, with `tabular-nums` for all financial figures, fees, and order quantities.

---

### 3. Key Product Decisions & Trade-Offs

- **Decision 1: Interactive Unified Experience with Seamless Mode Switcher**
  - *Chosen Approach*: Single high-performance SPA providing dedicated views for Landing, Client Portal, Super Admin, and Template Documentation, synchronized through an executive top-bar controller.
  - *Why*: Allows instant inspection of all user roles, formation gateways, and admin tools in one responsive live environment.
  - *Alternative Considered*: Splitting into hard subdomains; rejected because it prevents smooth browser previews in the development container.

- **Decision 2: Rich Sandbox State with LocalStorage Persistence**
  - *Chosen Approach*: In-memory reactive state manager backed by browser local storage for stores, orders, company filings, subscriptions, and AI prompts.
  - *Why*: Ensures safe, zero-leak testing of payment simulations, company filings, and store edits without exposing live external credentials.

- **Decision 3: Complete GitHub Template Package Export**
  - *Chosen Approach*: Include a dedicated `/template-docs` section in the UI and clean code repository structure with `README.md`, `SETUP.md`, `ENV.example`, database schemas, and GitHub Actions workflow templates ready for export.
  - *Why*: Directly satisfies Requirement 7 ("QABS-UNIFIED-PLATFORM-TEMPLATE") with verifiable documentation and starter blueprints.

---

### 4. Technical Architecture & Data Strategy

```
┌────────────────────────────────────────────────────────────────────────┐
│                   QABS UNIFIED PLATFORM CONTROLLER                     │
│    (Language Toggle: AR/EN · Theme: Dark/Light · Mode Navigation)       │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
    ┌───────────────────────────────┼───────────────────────────────┐
    │                               │                               │
┌───▼─────────────────────┐ ┌───────▼─────────────────────┐ ┌───────▼─────────────────────┐
│   PUBLIC SHOWCASE       │ │   CUSTOMER PORTAL           │ │   SUPER ADMIN CONSOLE       │
│  - Hero & Value Prop    │ │  - Active Stores & Catalog  │ │  - Multi-Tenant Isolation   │
│  - Formation Solutions  │ │  - Formation Status Tracker │ │  - Staff Permissions & RBAC │
│  - Multi-Store Demos    │ │  - Bank Sandbox (Stripe/Wise│ │  - Formation Filing Approvals│
│  - Pricing & Calculator │ │  - AI Business Assistant    │ │  - System Revenue & Audits  │
└─────────────────────────┘ └─────────────────────────────┘ └─────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                      MODULAR REPOSITORY ENGINES                        │
│  qabs-core · qabs-formation · qabs-multi-store · qabs-ai · qabs-admin  │
│         qabs-billing · qabs-payments · qabs-crm · qabs-compliance      │
└────────────────────────────────────────────────────────────────────────┘
```

#### Core Entities & State Architecture:
1. `CompanyFormation`: Country (US/UK), State (Delaware/Wyoming), Company Name, Status (Draft/Submitted/Approved), EIN, Registered Agent, Annual Renewal Date.
2. `StoreInstance`: Store ID, Name, Domain, Currency, Product Count, Revenue, Orders, Status (Active/Maintenance).
3. `FinancialLedger`: Balance, Prepaid Credits, Pending Invoices, Commission Rates, Sandbox Transactions.
4. `AIWorkflow`: Marketing copy generator, business plan drafter, customer query auto-responder with `@google/genai` integration.
5. `SupportTicket`: User tickets, priority status, assigned staff, audit log.
