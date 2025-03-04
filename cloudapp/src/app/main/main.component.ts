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
    
    this.restService.call(`/conf/sets/${this.setID}/members`).pipe(
      finalize(() => {
        // We'll set loading to false after all user details are fetched
      })
    ).subscribe({
      next: (response) => {
        this.apiResult = response;
        
        if (Array.isArray(response.member)) {
          this.setMembers = response.member.map((member: any) => ({
            id: member.id,
            name: member.name,
            description: member.description,
            link: member.link
          }));
          
          console.log('Set members:', this.setMembers);
          
          // Fetch user details for each member
          this.fetchUserDetailsForMembers();
        } else {
          this.setMembers = [];
          this.loading = false;
          console.error('Expected response.member to be an array, but got:', response.member);
        }
      },
      error: (error) => {
        this.setMembers = [];
        this.loading = false;
        this.alert.error('Failed to fetch set members');
        console.error('Error fetching set members:', error);
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
        console.log('All user details:', usersArray);
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
      
      // Update the preferred language
      updatedUser.preferred_language = {
        value: "es",
        desc: "Spanish"
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
        }),
        catchError(error => {
          // Find the user in our array and update with error status
          const userToUpdate = this.userDetails.find(u => u.primary_id === user.primary_id);
          if (userToUpdate) {
            userToUpdate.updateStatus = 'error';
            userToUpdate.updateError = error.message || 'Unknown error';
          }
          console.error(`Error updating user ${user.primary_id}:`, error);
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
        console.log('Bulk update completed:', results);
        this.alert.success(`Updated ${results.length} users to Spanish language`);
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

  get members() {
    return this.setMembers;
  }
  
  get users() {
    return this.userDetails;
  }
}