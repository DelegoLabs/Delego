# System Design

This document provides a detailed system design for the Delego platform, including architectural layers, communication patterns, and deployment topology.

> **Repository layout**: The Delego platform is split across three repositories. This repo contains the web application (`apps/frontend`) and UI package (`packages/ui`). Backend microservices live in [DelegoLabs/Delego-backend](https://github.com/DelegoLabs/Delego-backend) and Soroban contracts in [DelegoLabs/Delego-contracts](https://github.com/DelegoLabs/Delego-contracts). Components referenced below as `apps/backend/*` and `contracts/*` reside in those repos.

## 📋 Table of Contents

- [Overview](#overview)
- [Architectural Layers](#architectural-layers)
- [Communication Patterns](#communication-patterns)
- [Data Flow](#data-flow)
- [Deployment Topology](#deployment-topology)
- [Scalability](#scalability)
- [Reliability](#reliability)

## Overview

See [../README.md](../../README.md) for a platform overview. This document focuses on the detailed system design, including layer separation, communication patterns, and deployment strategies.

### Design Goals

- **Separation of Concerns**: Clear separation between layers
- **Loose Coupling**: Minimal dependencies between components
- **High Cohesion**: Related functionality grouped together
- **Scalability**: System can scale horizontally
- **Reliability**: System is fault-tolerant

## Architectural Layers

### Presentation Layer

**Components**: `apps/frontend` (merchant and mobile apps are planned, not yet implemented)

The presentation layer handles user interaction and UI rendering.

#### Responsibilities

- User interface rendering
- User input handling
- Client-side validation
- State management
- API communication

#### Technologies

- **Web**: Next.js, React, Tailwind CSS
- **Mobile**: React Native (Planned)
- **State Management**: React Context + Hooks
- **API Client**: @delegolabs/sdk

#### Key Considerations

- Responsive design for all devices
- Progressive enhancement
- Accessibility compliance
- Performance optimization
- SEO optimization

### API Layer

**Components**: `apps/backend/gateway`

The API layer provides a unified API entry point for all clients.

#### Responsibilities

- Request routing
- Authentication and authorization
- Rate limiting
- Request/response transformation
- API versioning

#### Technologies

- **Framework**: Node.js HTTP server (`@delegolabs/utils`)
- **Authentication**: JWT
- **Rate Limiting**: Redis
- **Documentation**: OpenAPI/Swagger

#### Key Considerations

- Consistent API design
- Backward compatibility
- Security best practices
- Performance optimization
- Monitoring and logging

### Application Layer

**Components**: `apps/backend/orchestrator`, `agents` (in [DelegoLabs/Delego-backend](https://github.com/DelegoLabs/Delego-backend))

The application layer contains business logic and workflow orchestration.

#### Responsibilities

- Workflow orchestration
- Agent coordination
- Business rule enforcement
- State management
- Event publishing

#### Technologies

- **Framework**: Node.js with TypeScript
- **State Machine**: Custom XState-style state machine (no external dependency)
- **Event Bus**: Redis Pub/Sub
- **Workflow Engine**: Custom orchestrator

#### Key Considerations

- Workflow reliability
- Agent coordination
- State persistence
- Error handling
- Transaction management

### Domain Layer

**Components**: `apps/backend/wallet`, `apps/backend/payments`, `apps/backend/catalog`

The domain layer contains core business entities and domain logic.

#### Responsibilities

- Domain entity management
- Business rule enforcement
- Data validation
- Domain events
- Repository pattern

#### Technologies

- **Framework**: Node.js with TypeScript
- **Database**: PostgreSQL
- **Cache**: Redis
- **Blockchain**: Stellar SDK, Soroban SDK

#### Key Considerations

- Domain model purity
- Business rule encapsulation
- Data integrity
- Performance optimization
- Security

### Infrastructure Layer

**Components**: PostgreSQL, Redis, Soroban

The infrastructure layer provides foundational services.

#### Responsibilities

- Data persistence
- Caching
- Blockchain interaction
- Message queuing
- File storage

#### Technologies

- **Database**: PostgreSQL 16
- **Cache**: Redis 7
- **Blockchain**: Stellar, Soroban
- **Storage**: S3 (Planned)

#### Key Considerations

- Data durability
- Performance
- Scalability
- Security
- Cost optimization

## Communication Patterns

### External Communication

**Protocol**: REST/JSON via gateway

External clients communicate with the platform via the API gateway using REST over HTTP with JSON payloads.

#### Request Flow

```
Client → Gateway → Authentication → Authorization → Routing → Service
```

#### Response Flow

```
Service → Gateway → Response Transformation → Client
```

#### Key Features

- HTTPS/TLS encryption
- JWT authentication
- Rate limiting
- CORS handling
- Request/response logging

### Internal Communication

**Protocol**: HTTP between services (TODO: evaluate gRPC or message queue)

Internal services communicate via HTTP/REST. Future consideration for gRPC or message queue.

#### Service-to-Service Communication

```
Service A → HTTP → Service B
```

#### Service Discovery

- **Development**: Hardcoded localhost URLs
- **Staging**: Kubernetes service discovery
- **Production**: Service mesh (Istio)

#### Future Considerations

- **gRPC**: For high-performance internal communication
- **Message Queue**: For asynchronous communication
- **Service Mesh**: For advanced traffic management

### On-Chain Communication

**Protocol**: Soroban contract invocations via wallet service

Blockchain interactions are mediated by the wallet service.

#### Contract Invocation Flow

```
Service → Wallet Service → Soroban RPC → Smart Contract
```

#### Key Features

- Transaction simulation
- Gas estimation
- Transaction signing
- Transaction submission
- Event listening

## Data Flow

### User Registration Flow

```
1. User submits registration form (Presentation)
2. Gateway validates request (API)
3. User service creates user account (Application)
4. User data persisted to database (Infrastructure)
5. Confirmation sent to user (Notification)
```

### Delegation Creation Flow

```
1. User creates delegation (Presentation)
2. Gateway authenticates user (API)
3. Orchestrator creates delegation (Application)
4. Permissions contract invoked (Domain)
5. Wallet service signs transaction (Domain)
6. Transaction submitted to blockchain (Infrastructure)
7. Confirmation sent to user (Notification)
```

### Purchase Flow

```
1. User initiates purchase (Presentation)
2. Gateway validates request (API)
3. Orchestrator initiates workflow (Application)
4. Buyer agent searches products (Application)
5. Products presented to user (Presentation)
6. User approves purchase (Presentation)
7. Payment agent enforces policy (Application)
8. Escrow contract funded (Domain)
9. Funds locked in escrow (Infrastructure)
10. Order status updated (Application)
11. Notification sent to user (Notification)
```

## Deployment Topology

### Development Environment

```
┌─────────────────────────────────────────┐
│         Developer Machine               │
│  ┌──────────┐  ┌──────────┐            │
│  │  Web App │  │ Services │            │
│  └──────────┘  └──────────┘            │
│       │              │                 │
│       └──────────────┼─────────────────┘
│                      ▼                 │
│  ┌──────────────────────────────┐     │
│  │    Docker Compose (backend)   │     │
│  │  ┌────────┐  ┌────────┐      │     │
│  │  │  Postgres │  │ Redis  │      │     │
│  │  └────────┘  └────────┘      │     │
│  └──────────────────────────────┘     │
└─────────────────────────────────────────┘
```

### Staging Environment

```
┌─────────────────────────────────────────┐
│           Kubernetes Cluster             │
│  ┌──────────┐  ┌──────────┐            │
│  │  Web App │  │ Services │            │
│  │  (Pods)  │  │ (Pods)  │            │
│  └──────────┘  └──────────┘            │
│       │              │                 │
│       └──────────────┼─────────────────┘
│                      ▼                 │
│  ┌──────────────────────────────┐     │
│  │  Managed Services           │     │
│  │  ┌────────┐  ┌────────┐      │     │
│  │  │  RDS    │  │ ElastiCache │     │
│  │  └────────┘  └────────┘      │     │
│  └──────────────────────────────┘     │
└─────────────────────────────────────────┘
```

### Production Environment

```
┌─────────────────────────────────────────┐
│           Multi-Region K8s               │
│  ┌──────────┐  ┌──────────┐            │
│  │ Region A │  │ Region B │            │
│  │  K8s     │  │  K8s     │            │
│  └──────────┘  └──────────┘            │
│       │              │                 │
│       └──────────────┼─────────────────┘
│                      ▼                 │
│  ┌──────────────────────────────┐     │
│  │  Global Load Balancer        │     │
│  └──────────────────────────────┘     │
└─────────────────────────────────────────┘
```

## Scalability

### Horizontal Scaling

Services can be scaled horizontally based on demand:

- **Web App**: Auto-scaling based on traffic
- **API Gateway**: Auto-scaling based on request rate
- **Services**: Auto-scaling based on CPU/memory
- **Database**: Read replicas for scaling reads

### Vertical Scaling

Vertical scaling for specific components:

- **Database**: Increase instance size
- **Cache**: Increase cache size
- **Blockchain**: Higher throughput networks

### Caching Strategy

Multi-layer caching for performance:

- **CDN**: Static assets
- **Application Cache**: Frequently accessed data
- **Database Cache**: Query results
- **Blockchain Cache**: Contract state

### Database Scaling

Database scaling strategies:

- **Read Replicas**: Scale read operations
- **Connection Pooling**: Efficient connection management
- **Query Optimization**: Optimize slow queries
- **Sharding**: Horizontal data partitioning (future)

## Reliability

### High Availability

High availability through redundancy:

- **Multi-Region Deployment**: Geographic redundancy
- **Load Balancing**: Distribute traffic
- **Health Checks**: Monitor service health
- **Auto-Healing**: Automatic recovery

### Fault Tolerance

Graceful degradation on failures:

- **Circuit Breakers**: Prevent cascading failures
- **Retries**: Automatic retry with exponential backoff
- **Fallbacks**: Alternative data sources
- **Timeouts**: Prevent hanging requests

### Data Backup

Regular backups for data protection:

- **Database Backups**: Daily automated backups
- **Point-in-Time Recovery**: Restore to any point
- **Cross-Region Replication**: Geographic redundancy
- **Backup Testing**: Regular restore testing

### Monitoring

Comprehensive monitoring for observability:

- **Metrics**: Prometheus for metrics collection
- **Logging**: Structured logging with correlation IDs
- **Tracing**: Distributed tracing for request tracking
- **Alerting**: AlertManager for alert management

### Disaster Recovery

Disaster recovery procedures:

- **RTO**: Recovery Time Objective < 1 hour
- **RPO**: Recovery Point Objective < 15 minutes
- **Documentation**: Detailed runbooks
- **Testing**: Regular disaster recovery drills

## Security

### Network Security

- **VPC**: Isolated virtual private cloud
- **Security Groups**: Restrictive firewall rules
- **Private Subnets**: Services in private subnets
- **Bastion Host**: Secure access to private resources

### Application Security

- **TLS/SSL**: All communication encrypted
- **Authentication**: JWT-based authentication
- **Authorization**: Role-based access control
- **Input Validation**: Validate all inputs

### Data Security

- **Encryption at Rest**: All data encrypted
- **Encryption in Transit**: TLS for all communication
- **Delivery Instructions**: Gate codes and buzzer notes are encrypted in the browser with the merchant's published RSA-OAEP key before they are attached to an order, so only that merchant can read them (see `apps/frontend/lib/deliveryInstructions.ts`)
- **Key Management**: Secure key storage
- **Access Control**: Least privilege access

### Blockchain Security

- **Smart Contract Audits**: Professional security audits
- **Access Control**: Contract access controls
- **Input Validation**: Contract input validation
- **Reentrancy Protection**: Reentrancy guards

## Performance

### Performance Targets

- **API Response Time**: < 200ms (p95)
- **Web Page Load**: < 2 seconds
- **Transaction Confirmation**: < 30 seconds
- **Agent Execution**: < 10 seconds

### Optimization Strategies

- **Caching**: Multi-layer caching
- **Database Optimization**: Query optimization, indexing
- **Code Optimization**: Efficient algorithms
- **CDN**: Content delivery network

### Monitoring

- **APM**: Application performance monitoring
- **RUM**: Real user monitoring
- **Synthetic Monitoring**: Synthetic transaction monitoring
- **Profiling**: Regular performance profiling

---

**Last Updated**: August 2026
