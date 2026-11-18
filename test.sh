#!/usr/bin/env bash

ALICE="4a17d54d-9470-43e9-ab32-6f5348e8ad97"
BOB="281eb4bd-4e2b-4b46-aa94-2516d622f4b5"

echo "Test 1"
curl -X POST http://localhost:3300/transfers \
-H "Content-Type: application/json" \
-H "x-tenant-id: tenant-a" \
-H "x-idempotency-key: test-key-1" \
-d "{\"fromWalletId\": \"$ALICE\", \"toWalletId\": \"$BOB\", \"amount\":2000}"
echo -e "\n"

echo "Test 2"
curl -X POST http://localhost:3300/transfers \
-H "Content-Type: application/json" \
-H "x-tenant-id: tenant-a" \
-H "x-idempotency-key: test-key-1" \
-d "{\"fromWalletId\": \"$ALICE\", \"toWalletId\": \"$BOB\", \"amount\":2000}"
echo -e "\n"

echo "Test 3"
curl -X POST http://localhost:3300/transfers \
-H "Content-Type: application/json" \
-H "x-tenant-id: tenant-a" \
-H "x-idempotency-key: test-key-1" \
-d "{\"fromWalletId\": \"$ALICE\", \"toWalletId\": \"$BOB\", \"amount\":1234}"
echo -e "\n"
