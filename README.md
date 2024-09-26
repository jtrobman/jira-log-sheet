## Project Setup
1. Rename `.env-sample` to `.env` and replace values accordingly

## Google Cloud Setup
1. Go to the Google Cloud Console
1. Create a New Project or Select an Existing One
1. Enable Google Sheets API
1. Create a Service Account
1. Grant Service Account Access (skip)
1. Create and Download the JSON Key
1. Rename the JSON key file to `credentials.json` and move to this project's root directory

## Create your Google Sheet
1. Create a Google Sheet for this project and copy the Spreadsheet ID
1. Add the Spreadsheet ID to your .env file as SPREADSHEET_ID
1. Open Google Sheet and share this file with the `client_email` from your `credentials.json` file with Edit access

## Get a Jira API Token
1. Go to your [Atlassian Account](https://id.atlassian.com/manage-profile/security/api-tokens) and create an API Token
2. Copy your API Token to `.env`
