cd backend
go clean -testcache
go test ./...

cd ../frontend
npm run test:run
npm run check