[![Backend CI](https://github.com/Mubashir2431/feightly-ai/actions/workflows/backend-ci.yml/badge.svg)](https://github.com/Mubashir2431/feightly-ai/actions/workflows/backend-ci.yml)

# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.

## Testing and CI/CD

The Freightly.ai backend has automated tests under `backend/test` (Jest and ts-jest, 99 tests). They cover load search scoring and corridor chains, load booking, the copilot natural-language parsing, the shared helpers, and the CDK stack template. AWS calls are mocked, so no AWS account is needed.

```bash
cd backend
npm ci
npx jest --coverage
```

Coverage is about 49% of lines overall. The core search, booking and copilot lambdas are above 98%, and Jest enforces thresholds on them.

A GitHub Actions workflow (`.github/workflows/backend-ci.yml`) runs on pushes and pull requests to `master` that touch `backend/`. It installs dependencies, type checks, runs the tests with coverage, and runs `cdk synth`. On a push to `master` a deploy job runs `cdk deploy`, but only if the `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` repository secrets are set. Without them the job is skipped.
