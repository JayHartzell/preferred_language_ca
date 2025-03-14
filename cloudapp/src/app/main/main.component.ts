import { Component, OnDestroy, OnInit } from '@angular/core';
import {
  AlertService,
  CloudAppEventsService,
  CloudAppRestService,
  Entity,
  HttpMethod,
  Request
} from '@exlibris/exl-cloudapp-angular-lib';
import { forkJoin, Observable, of, Subscription } from 'rxjs';
import { finalize, tap, catchError } from 'rxjs/operators';
import { DomSanitizer } from '@angular/platform-browser';

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
    { value: 'ar', desc: 'Arabic' },
    { value: 'eu', desc: 'Basque' },
    { value: 'ca', desc: 'Catalan; Valencian' },
    { value: 'zh', desc: 'Chinese' },
    { value: 'cs', desc: 'Czech' },
    { value: 'da', desc: 'Danish' },
    { value: 'nl', desc: 'Dutch; Flemish' },
    { value: 'en', desc: 'English' },
    { value: 'fi', desc: 'Finnish' },
    { value: 'fr', desc: 'French' },
    { value: 'gl', desc: 'Galician' },
    { value: 'de', desc: 'German' },
    { value: 'haw', desc: 'Hawaiian' },
    { value: 'he', desc: 'Hebrew' },
    { value: 'hu', desc: 'Hungarian' },
    { value: 'is', desc: 'Icelandic' },
    { value: 'ga', desc: 'Irish' },
    { value: 'it', desc: 'Italian' },
    { value: 'ja', desc: 'Japanese' },
    { value: 'ko', desc: 'Korean' },
    { value: 'lt', desc: 'Lithuanian' },
    { value: 'ms', desc: 'Malay' },
    { value: 'nb', desc: 'Bokmål, Norwegian; Norwegian Bokmål' },
    { value: 'no', desc: 'Norwegian' },
    { value: 'se', desc: 'Northern Sami' },
    { value: 'pl', desc: 'Polish' },
    { value: 'pt', desc: 'Portuguese (Brazil)' },
    { value: 'pt1', desc: 'Portuguese (Portugal)' },
    { value: 'ru', desc: 'Russian' },
    { value: 'es', desc: 'Spanish' },
    { value: 'sv', desc: 'Swedish' },
    { value: 'mi', desc: 'Te Reo Māori' },
    { value: 'th', desc: 'Thai' },
    { value: 'zh-tw', desc: 'Traditional Chinese' },
    { value: 'tr', desc: 'Turkish' },
    { value: 'uk', desc: 'Ukrainian' },
    { value: 'cy', desc: 'Welsh' }
];

  selectedLanguage = this.languageOptions[29]; // Default to Spanish

  // Add to your component properties
  updateLog: LogEntry[] = [];

  // Add session monitoring
  private sessionSubscription!: Subscription;
  
  constructor(
    private restService: CloudAppRestService,
    private eventsService: CloudAppEventsService,
    private alert: AlertService,
    private sanitizer: DomSanitizer
  ) {
    this.entities$ = this.eventsService.entities$.pipe(tap(() => this.clear()));
  }

  ngOnInit() {
    // Monitor for session activity
    this.sessionSubscription = this.eventsService.getAuthToken().subscribe({
      error: () => {
        this.alert.error('Your session has expired. Please refresh the page to login again.');
      }
    });
  }

  ngOnDestroy(): void {
    // Clean up subscriptions to prevent memory leaks
    if (this.sessionSubscription) {
      this.sessionSubscription.unsubscribe();
    }
  }

  clear() {
  // Clear all data and state
  this.setID = '';
  this.setMembers = []; 
  this.userDetails = []; 
  this.updateLog = [];
  this.updateSummary = '';
  this.apiResult = null;
  this.setEntities = [];
  
  // Reset any other state variables you need
  this.loading = false;
  this.updating = false;
  }

  fetchSet(setID: string) {
    // Input validation
    if (!setID || !this.isValidSetId(setID)) {
      this.alert.error('Please provide a valid Set ID');
      return;
    }

    const sanitizedSetID = this.sanitizeInput(setID);
    
    this.setID = sanitizedSetID;
    this.loading = true;
    this.userDetails = [];
    this.setMembers = [];
    this.updateLog = [];
    this.updateSummary = '';
    
    // First get set information
    this.fetchSetInfo(sanitizedSetID).subscribe({
      next: (setInfo) => {
        // Check if the set contains users
        if (!setInfo.content || setInfo.content.value !== 'USER') {
          this.loading = false;
          this.alert.error(`This set contains ${setInfo.content?.desc || 'unknown'} records. Only USER sets are supported.`);
          return;
        }
        
        // After getting set info, fetch the members
        this.fetchSetMembersPage(sanitizedSetID, 0);
      },
      error: (error) => {
        this.loading = false;
        this.alert.error('Failed to retrieve set information');
      }
    });
  }

  fetchSetInfo(setID: string): Observable<any> {
    // Call the conf/sets/{set_id} endpoint
    return this.restService.call(`/conf/sets/${setID}`);
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
          
          // Check if we need to fetch more pages
          if (response.member.length === 100) {
            // If we got a full page, there might be more - fetch next page
            this.fetchSetMembersPage(setID, offset + 100, updatedMembers);
          } else {
            // We've fetched all pages
            this.loading = false;
          }
        } else {
          this.setMembers = allMembers; // Use what we have so far
          this.loading = false;
        }
      },
      error: (error) => {
        this.setMembers = allMembers; // Use what we have so far
        this.loading = false;
        this.alert.error(`Failed to fetch set members page (offset ${offset})`);
      }
    });
  }

  fetchUserDetailsForMembers() {
    if (this.setMembers.length === 0) {
      this.loading = false;
      return;
    }
    
    // Create an array of observables for each user request
    const userRequests = this.setMembers.map(member => 
      this.fetchUserDetails(member.id.toString()).pipe(
        catchError(error => {
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
        this.userDetails = usersArray;
      },
      error: (error) => {
        this.alert.error('Failed to fetch some user details');
      }
    });
  }
  
  fetchUserDetails(userId: string): Observable<any> {
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
      })
    ).subscribe({
      next: results => {
        this.alert.success(`Updated ${results.length} users to ${this.selectedLanguage.desc} language`);
      },
      error: error => {
        this.alert.error('Failed to complete bulk update');
      }
    });
  }
  
  updateUserLanguage(userId: string, updatedUser: any): Observable<any> {
    const request: Request = {
      url: `/users/${userId}?override=preferred_language`,
      method: HttpMethod.PUT,
      requestBody: updatedUser
    };
    
    
    return this.restService.call(request);
  }

  private logUpdateResult(user: any, status: 'success' | 'error', message: string) {
    if (!user) {
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
  }

  copyLogToClipboard() {
    // Ensure we're only copying necessary data
    const header = ['User ID', 'Status', 'Language', 'Timestamp'];
    
    // Limit the data exposed in clipboard copy
    const rows = this.updateLog.map(entry => [
      entry.userId,
      entry.status,
      entry.language,
      new Date(entry.timestamp).toLocaleString()
    ]);
    
    // Combine header and rows
    const csvContent = [
      header.join('\t'),
      ...rows.map(row => row.join('\t'))
    ].join('\n');
    
    // Copy to clipboard
    navigator.clipboard.writeText(csvContent)
      .then(() => {
        this.alert.success('Update log copied to clipboard!');
      })
      .catch(err => {
        this.alert.error('Failed to copy to clipboard.');
      });
  }

  // Input validation helper 
  private isValidSetId(id: string): boolean {
    // validation for numeric set IDs 
    return /^\d{12,18}$/.test(id);
  }
  
  // Basic sanitization
  // Comprehensive sanitization
  private sanitizeInput(input: string): string {
    // Trim the input and remove special characters
    return input.trim().replace(/[^a-zA-Z0-9]/g, '');
  }
  get members() {
    return this.setMembers;
  }
  
  get users() {
    return this.userDetails;
  }
}