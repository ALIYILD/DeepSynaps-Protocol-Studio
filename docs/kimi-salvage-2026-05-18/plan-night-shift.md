# Night Shift Autonomous Plan
## Goal: 90% test coverage + deploy-ready

## Stage 1: Fix failing tests (new files)
- test_safety_governance.py — fix assertions to match actual API
- test_main.py — fix HealthResponse assertions
- test_contracts.py — verify all dataclass APIs
- test_knowledge_layer.py — fix imports
- test_database.py — fix assertions

## Stage 2: Coverage analysis
- Run coverage report locally
- Identify gaps in coverage
- Map each source file to test coverage %

## Stage 3: Fill coverage gaps to 90%
- Write missing tests for uncovered lines
- Focus on: main.py endpoints, database.py, cache_service.py, config.py
- Target: 90% line coverage

## Stage 4: Final verification
- Run full test suite locally
- Confirm coverage >= 90%
- Commit and push

## Stage 5: Deploy
- docker-compose up --build
- Verify health endpoint
- Final readiness report
