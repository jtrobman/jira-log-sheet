require('dotenv').config();

const fs = require('fs');
const JiraClient = require('jira-client');
const moment = require('moment');
const prompt = require('prompt-sync')({ sigint: true });
const { google } = require('googleapis');

// Initialize JIRA client
const jira = new JiraClient({
  protocol: 'https',
  host: process.env.JIRA_HOST,
  username: process.env.JIRA_USERNAME,
  password: process.env.JIRA_API_TOKEN,
  apiVersion: '2',
  strictSSL: true,
});

// Fetch worklogs from JIRA
async function getWorklogs(username, startDate, endDate) {
  try {
    const jqlQuery = `worklogAuthor = "${username}" AND worklogDate >= "${startDate}" AND worklogDate <= "${endDate}"`;
    const issues = await jira.searchJira(jqlQuery, { maxResults: 1000 });
    const worklogs = [];

    // Ensure the issues property exists
    if (issues.issues && issues.issues.length > 0) {
      for (const issue of issues.issues) {
        const { key } = issue;

        // Fetch detailed issue information, including worklogs
        const detailedIssue = await jira.getIssue(key);
        const worklogEntries = detailedIssue.fields.worklog.worklogs;

        if (worklogEntries && worklogEntries.length > 0) {
          for (const log of worklogEntries) {
            worklogs.push({
              started: log.started,
              issueKey: key,
              issueSummary: detailedIssue.fields.summary,
              timeSpent: log.timeSpentSeconds || 0,
              comment: log.comment || '',
            });
          }
        } else {
          console.log(`No worklogs found for issue: ${key}`);
        }
      }
    } else {
      console.log('No issues found for the given JQL.');
    }

    // Sort worklogs by the 'started' date in ascending order
    worklogs.sort((a, b) => new Date(a.started) - new Date(b.started));

    return worklogs;
  } catch (error) {
    console.error('Error fetching worklogs:', error);
    throw error;
  }
}

// Add worklogs to Google Sheet
async function addWorklogsToGoogleSheet(worklogs) {
  try {
    const spreadsheetId = process.env.SPREADSHEET_ID;
    const range = 'A1:E'; // Range to write the data

    // Load client secrets from a local file
    const client = google.auth.fromJSON(require('./credentials.json'));
    client.scopes = ['https://www.googleapis.com/auth/spreadsheets'];

    const sheets = google.sheets({ version: 'v4', auth: client });

    // Add header row if the sheet is empty
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: spreadsheetId,
      range: range,
    });

    if (!response.data.values || response.data.values.length === 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: spreadsheetId,
        range: range,
        valueInputOption: 'RAW',
        resource: {
          values: [['Date', 'Issue', 'Summary', 'Hours', 'Comment']],
        },
      });
    }

    // Prepare rows for adding
    const rows = worklogs.map((log) => [
      log.started,
      log.issueKey, // Keep issue key as text for the first entry
      log.issueSummary,
      Number((log.timeSpent / 3600).toFixed(2)), // Convert seconds to hours
      log.comment,
    ]);

    // Add data rows
    await sheets.spreadsheets.values.append({
      spreadsheetId: spreadsheetId,
      range: range,
      valueInputOption: 'RAW', // Use RAW to add plain values
      resource: {
        values: rows,
      },
    });

    // Calculate the correct starting row index for hyperlinks
    const currentValues = response.data.values || [];
    const rowIndexStart = currentValues.length; // Use the length of current values for next row index

    // Now set hyperlinks for the issue keys in a batch
    const updates = worklogs.map((log, index) => {
      return {
        updateCells: {
          rows: [{
            values: [{
              userEnteredValue: {
                formulaValue: `=HYPERLINK("https://${process.env.JIRA_HOST}/browse/${log.issueKey}", "${log.issueKey}")`
              },
            }],
          }],
          fields: '*',
          start: {
            sheetId: 0, // Assuming we're using the first sheet
            rowIndex: rowIndexStart + index + 1,
            columnIndex: 1, // Start at the second column (Issue)
          },
        },
      };
    });

    // Send batch update request to set hyperlinks
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: spreadsheetId,
      resource: {
        requests: updates,
      },
    });

    console.log('Worklogs added to Google Sheet successfully.');
  } catch (error) {
    console.error('Error adding worklogs to Google Sheet:', error);
    throw error;
  }
}

// Prompt user for inputs, pull data from Jira, and add data to Google Sheet
(async function () {
  try {
    // Prompt the user for the JIRA username/email for worklogs
    const username = prompt(`Enter the JIRA username (email) for worklogs [Default: ${process.env.JIRA_USERNAME}]: `) || process.env.JIRA_USERNAME;

    // Get default date values
    const defaultStartDate = moment().startOf('month').format('YYYY-MM-DD');
    const defaultEndDate = moment().format('YYYY-MM-DD');

    // Prompt the user for the start and end dates
    const startDate = prompt(`Enter the start date (YYYY-MM-DD) [Default: ${defaultStartDate}]: `) || defaultStartDate;
    const endDate = prompt(`Enter the end date (YYYY-MM-DD) [Default: ${defaultEndDate}]: `) || defaultEndDate;

    console.log(`Fetching worklogs for ${username} between ${startDate} and ${endDate}...`);
    const worklogs = await getWorklogs(username, startDate, endDate);

    if (worklogs.length > 0) {
      console.log(`Found ${worklogs.length} worklogs. Adding to Google Sheet...`);
      await addWorklogsToGoogleSheet(worklogs);
    } else {
      console.log('No worklogs found for the given period.');
    }
  } catch (error) {
    console.error('Error:', error);
  }
})();
