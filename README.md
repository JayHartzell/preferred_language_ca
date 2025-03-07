# Preferred Language Updater

This app allows you to retrieve sets of users and update their preferred language settings in a single operation.

## Features
- Fetch users from any valid Set ID
- View detailed information about users in a set
- Bulk update preferred language settings for multiple users simultaneously
- Track success and failure of language update operations
- Export update results to clipboard

## How to Use

### Retrieving a Set
1. Enter a valid Set ID in the input field at the top of the page.
2. Click the "Retrieve Set Members" button.
3. The app will display the total number of set members found.
4. If the set contains users, their details will be displayed.

### Updating User Languages
1. After retrieving a set containing users, a language selection dropdown will appear.
2. Select the desired language from the dropdown menu.
3. Click the "Update All" button to change all users' preferred language to the selected option.
4. The app will display a progress indicator while updates are being processed.
5. Once complete, a summary will show the number of successful and failed updates.

### Viewing Results
Each user card will display:
- User's name and ID
- Current preferred language (highlighted if just updated)
- Update status (success or failure with reason)
- Expandable section with additional user details

A summary count appears at the top showing:
- Total members in the set
- Number of successful/failed updates

### Exporting Results
If you need to document the changes made:
1. After performing updates, a "Copy Results to Clipboard" button will appear.
2. Click this button to copy a formatted report of all changes to your clipboard.
3. Paste the results into any document or spreadsheet for record-keeping.
