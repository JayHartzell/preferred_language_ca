import { Component, OnDestroy, OnInit } from '@angular/core';
import {
  AlertService,
  CloudAppEventsService,
  CloudAppRestService,
  Entity,
  HttpMethod,
  Request
} from '@exlibris/exl-cloudapp-angular-lib';
import { forkJoin, Observable, of } from 'rxjs';
import { finalize, tap, catchError } from 'rxjs/operators';
interface LogEntry {
  userId: string;
  userName: string;
  status: 'success' | 'error';
  language: string;
  message: string;
  timestamp: Date;
}
@Component({
  selector: 'app-main',
  templateUrl: './main.component.html',
  styleUrls: ['./main.component.scss']
})
export class MainComponent implements OnInit, OnDestroy {

  loading = false;
  updating = false;
  updateSummary = '';
  selectedEntity: Entity | null = null;
  apiResult: any;

  entities$: Observable<Entity[]>;
  setEntities: Entity[] = [];
  setID: string = '';
  private setMembers: Array<{ id: number, name: string, description: string, link: string }> = [];
  userDetails: Array<any> = [];
  
  // Add language options
  languageOptions = [
    { value: 'es', desc: 'Spanish' },
    { value: 'en', desc: 'English' }
  ];
  selectedLanguage = this.languageOptions[0]; // Default to Spanish

  // Define a type for log entries
 

  // Add to your component properties
  updateLog: LogEntry[] = [];

  constructor(
    private restService: CloudAppRestService,
    private eventsService: CloudAppEventsService,
    private alert: AlertService
  ) {
    this.entities$ = this.eventsService.entities$.pipe(tap(() => this.clear()));
  }

  ngOnInit() {
   
  }

  ngOnDestroy(): void {
  }

  clear() {
    this.apiResult = null;
    this.setEntities = [];
    this.setID = '';
    this.userDetails = [];
    this.updateSummary = '';
  }

  fetchSet(setID: string) {
    this.setID = setID;
    this.loading = true;
    this.userDetails = [];
    this.setMembers = [];
    
    // Start with first page, will fetch all pages
    this.fetchSetMembersPage(setID, 0);
  }
  
  fetchSetMembersPage(setID: string, offset: number, allMembers: any[] = []) {
    // Use limit=100 to get more members per page, offset for pagination
    this.restService.call(`/conf/sets/${setID}/members?limit=100&offset=${offset}`).pipe(
      finalize(() => {
        // Only complete loading when we've fetched all pages
        if (!this.loading) {
          this.fetchUserDetailsForMembers();
        }
      })
    ).subscribe({
      next: (response) => {
        if (Array.isArray(response.member)) {
          const currentPageMembers = response.member.map((member: any) => ({
            id: member.id,
            name: member.name,
            description: member.description,
            link: member.link
          }));
          
          // Add current page members to our collection
          const updatedMembers = [...allMembers, ...currentPageMembers];
          this.setMembers = updatedMembers;
          
          console.log(`Fetched ${currentPageMembers.length} members, total now: ${updatedMembers.length}`);
          
          // Check if we need to fetch more pages
          if (response.member.length === 100) {
            // If we got a full page, there might be more - fetch next page
            console.log(`Fetching next page, offset: ${offset + 100}`);
            this.fetchSetMembersPage(setID, offset + 100, updatedMembers);
          } else {
            // We've fetched all pages
            console.log(`All set members fetched: ${updatedMembers.length} total`);
            this.loading = false;
          }
        } else {
          this.setMembers = allMembers; // Use what we have so far
          this.loading = false;
          console.error('Expected response.member to be an array, but got:', response.member);
        }
      },
      error: (error) => {
        this.setMembers = allMembers; // Use what we have so far
        this.loading = false;
        this.alert.error(`Failed to fetch set members page (offset ${offset})`);
        console.error('Error fetching set members:', error);
      }
    });
  }

  fetchUserDetailsForMembers() {
    if (this.setMembers.length === 0) {
      this.loading = false;
      return;
    }
    
    console.log(`Fetching user details for ${this.setMembers.length} members`);
    
    // Create an array of observables for each user request
    const userRequests = this.setMembers.map(member => 
      this.fetchUserDetails(member.id.toString()).pipe(
        catchError(error => {
          console.error(`Error fetching user ${member.id}:`, error);
          // Return a placeholder on error so forkJoin doesn't fail completely
          return of({ id: member.id, error: 'Failed to load user details' });
        })
      )
    );
    
    // Execute all requests in parallel
    forkJoin(userRequests).pipe(
      finalize(() => this.loading = false)
    ).subscribe({
      next: (usersArray) => {
        console.log(`Received details for ${usersArray.length} users`);
        this.userDetails = usersArray;
      },
      error: (error) => {
        console.error('Error in user details batch request:', error);
        this.alert.error('Failed to fetch some user details');
      }
    });
  }
  
  fetchUserDetails(userId: string): Observable<any> {
    console.log(`Fetching details for user: ${userId}`);
    return this.restService.call(`/users/${userId}`);
  }
  
  bulkUpdateLanguage() {
    if (!this.userDetails || this.userDetails.length === 0) {
      this.alert.error('No users available to update');
      return;
    }
    
    this.updating = true;
    this.updateSummary = '';
      // Clear previous log entries
    this.updateLog = [];
    
    // Filter out users that had errors during fetch
    const validUsers = this.userDetails.filter(user => !user.error);
    
    if (validUsers.length === 0) {
      this.updating = false;
      this.alert.error('No valid users to update');
      return;
    }
    
    // Create an array of update requests
    const updateRequests = validUsers.map(user => {
      // Create a copy of the user object
      const updatedUser = { ...user };
      
      // Update the preferred language with selected language
      updatedUser.preferred_language = {
        value: this.selectedLanguage.value,
        desc: this.selectedLanguage.desc
      };
      
      // Return the update observable
      return this.updateUserLanguage(user.primary_id, updatedUser).pipe(
        tap(result => {
          // Find the user in our array and update with success status
          const userToUpdate = this.userDetails.find(u => u.primary_id === user.primary_id);
          if (userToUpdate) {
            // Update the user object with the result from the API
            Object.assign(userToUpdate, result);
            userToUpdate.updateStatus = 'success';
          }
          this.logUpdateResult(user, 'success', 'Language updated successfully');
        }),
        catchError(error => {
          // Find the user in our array and update with error status
          const userToUpdate = this.userDetails.find(u => u.primary_id === user.primary_id);
          if (userToUpdate) {
            userToUpdate.updateStatus = 'error';
            userToUpdate.updateError = error.message || 'Unknown error';
          }
          console.error(`Error updating user ${user.primary_id}:`, error);
          this.logUpdateResult(user, 'error', error.message || 'Unknown error');
          // Return a placeholder to continue with other requests
          return of({ primary_id: user.primary_id, updateStatus: 'error' });
        })
      );
    });
    
    // Execute all update requests in parallel
    forkJoin(updateRequests).pipe(
      finalize(() => {
        this.updating = false;
        // Calculate and display summary
        const successCount = this.userDetails.filter(user => user.updateStatus === 'success').length;
        const errorCount = this.userDetails.filter(user => user.updateStatus === 'error').length;
        this.updateSummary = `Updated: ${successCount} / Failed: ${errorCount}`;
        // Debug log
  console.log(`Update log has ${this.updateLog.length} entries`);
      })
    ).subscribe({
      next: results => {
        console.log('Bulk update completed:', results);
        this.alert.success(`Updated ${results.length} users to ${this.selectedLanguage.desc} language`);
      },
      error: error => {
        console.error('Error in bulk update:', error);
        this.alert.error('Failed to complete bulk update');
      }
    });
  }
  
  updateUserLanguage(userId: string, updatedUser: any): Observable<any> {
    console.log(`Updating language for user: ${userId}`);
    
    const request: Request = {
      url: `/users/${userId}`,
      method: HttpMethod.PUT,
      requestBody: updatedUser
    };
    
    return this.restService.call(request);
  }

  private logUpdateResult(user: any, status: 'success' | 'error', message: string) {
    console.log('Logging update result:', user?.primary_id || user?.id, status);
    
    if (!user) {
      console.error('Missing user object in logUpdateResult');
      return;
    }
    
    this.updateLog.push({
      userId: user.primary_id || user.id || 'unknown',
      userName: user.full_name || `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Unknown',
      status: status,
      language: this.selectedLanguage?.desc || 'Unknown',
      message: message,
      timestamp: new Date()
    });
    
    console.log(`Log entry added. Current log size: ${this.updateLog.length}`);
  }

  exportLogAsCSV() {
    // CSV header
    const header = ['User ID', 'Name', 'Status', 'Language', 'Message', 'Timestamp'];
    
    // Convert log data to CSV rows
    const rows = this.updateLog.map(entry => [
      entry.userId,
      entry.userName,
      entry.status,
      entry.language,
      entry.message,
      new Date(entry.timestamp).toLocaleString()
    ]);
    
    // Combine header and rows
    const csvContent = [
      header.join(','),
      ...rows.map(row => row.map(cell => 
        // Escape quotes and wrap in quotes if contains comma or quotes
        cell.toString().includes(',') || cell.toString().includes('"') 
          ? `"${cell.toString().replace(/"/g, '""')}"` 
          : cell
      ).join(','))
    ].join('\n');
    
    // Create download link
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    
    // Set file name with date
    const date = new Date().toISOString().split('T')[0];
    link.setAttribute('href', url);
    link.setAttribute('download', `language-update-log-${date}.csv`);
    link.style.visibility = 'hidden';
    
    // Trigger download
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  get members() {
    return this.setMembers;
  }
  
  get users() {
    return this.userDetails;
  }
}