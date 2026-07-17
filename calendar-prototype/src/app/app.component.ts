import {
  MbscModule,
  MbscResource,
  MbscEventUpdatedEvent,
  MbscEventUpdateEvent,
} from '@mobiscroll/angular';
import {
  MbscCalendarEvent,
  MbscEventcalendarView,
  MbscEventcalendar,
  setOptions,
} from '@mobiscroll/angular';
import { FormsModule } from '@angular/forms';
import { Component, OnInit, ViewChild } from '@angular/core';

// Discriminator for the placeholder events that live in the 3 fixed rows.
// They only carry UI (schedule form / toolbar / tabs), not real schedule data.
type FixedRowKind = 'schedule-slot' | 'toolbar' | 'tabs';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent {
  // Reference to the eventcalendar instance so we can call navigateToEvent().
  @ViewChild('inst', { static: false }) calendar!: MbscEventcalendar;

  public myResources: MbscResource[] = [];
  public myEvents: MbscCalendarEvent[] = [];

  // Single day, hour based timeline. Dates are irrelevant for this view, so the
  // date header row is hidden via CSS (see app.component.scss).
  public view: MbscEventcalendarView = {
    timeline: {
      type: 'day',
      // startTime: '00:00',
      // endTime: '24:00',
    },
  };

  public mySelectedDate = new Date('2024-11-21T00:00:00.000Z');

  // Without an explicit height the calendar has no bounded internal viewport,
  // so there is nothing for its virtual scroll to scroll - it just grows to fit
  // every row and the page itself scrolls instead. That's why navigateToEvent
  // appeared to only scroll horizontally: there was no vertical overflow to move.
  public calendarHeight = 600;

  // Active category tab (Systems / DUTs / Assets) - visual state only.
  public activeTab: 'systems' | 'duts' | 'assets' = 'systems';

  // Simple "schedule a work item" form state for the first fixed row.
  public scheduleTitle = '';
  public scheduleResource: string = 'dut-1';

  // The event used to demonstrate navigateToEvent. It lives on a resource well
  // below the fixed rows, so navigating to it requires scrolling.
  public targetEvent: MbscCalendarEvent = {
    id: 'target-event',
    resource: 'dut-3',
    start: new Date('2024-11-21T09:00:00.000Z'),
    end: new Date('2024-11-21T11:00:00.000Z'),
    title: 'TARGET EVENT',
    color: '#e53935',
  };

  public showPopup = false;
  public anchor: HTMLElement = document.createElement('div');

  private currentEventId: string | number = 0;
  private previousStart = new Date();
  private previousEnd = new Date();

  public constructor() {
    this.myResources = this.buildResources();
    this.myEvents = this.buildEvents();
  }

  private buildResources(): MbscResource[] {
    const resources: MbscResource[] = [
      // 3 fixed rows - pinned at the top, inside the same scroll container as
      // the rest of the resources (MbscResource.fixed = true). Because they are
      // part of the same virtualized resource list, Mobiscroll's own scrolling
      // (including navigateToEvent) automatically keeps them out of the way -
      // scrollable rows land just below them instead of being hidden behind.
      { id: 'fixed-schedule', fixed: true, name: 'Schedule', eventCreation: false, cssClass: 'fixed-resource-row' },
      { id: 'fixed-toolbar', fixed: true, name: 'Toolbar', eventCreation: false, cssClass: 'fixed-resource-row' },
      { id: 'fixed-tabs', fixed: true, name: 'Tabs', eventCreation: false, cssClass: 'fixed-resource-row' },
    ];

    // Systems, each with nested fixtures.
    for (let s = 1; s <= 3; s++) {
      resources.push({
        id: `sys-${s}`,
        name: `System ${s}`,
        children: [
          { id: `sys-${s}-fix-1`, name: `Fixture ${s}.1` },
          { id: `sys-${s}-fix-2`, name: `Fixture ${s}.2` },
        ],
      });
    }

    // DUTs.
    for (let d = 1; d <= 6; d++) {
      resources.push({ id: `dut-${d}`, name: `DUT ${d}` });
    }

    // Assets.
    for (let a = 1; a <= 6; a++) {
      resources.push({ id: `asset-${a}`, name: `Asset ${a}` });
    }

    return resources;
  }

  private buildEvents(): MbscCalendarEvent[] {
    const dayStart = new Date('2024-11-21T00:00:00.000Z');
    const dayEnd = new Date('2024-11-22T00:00:00.000Z');

    const fixedRow = (id: string, resource: string, kind: FixedRowKind): MbscCalendarEvent => ({
      id,
      resource,
      start: dayStart,
      end: dayEnd,
      editable: false,
      dragInTime: false,
      dragBetweenResources: false,
      resize: false,
      cssClass: 'fixed-row-event',
      kind,
    } as MbscCalendarEvent);

    return [
      fixedRow('schedule-slot-row', 'fixed-schedule', 'schedule-slot'),
      fixedRow('toolbar-row', 'fixed-toolbar', 'toolbar'),
      fixedRow('tabs-row', 'fixed-tabs', 'tabs'),
      this.targetEvent,
    ];
  }

  // Adds a new event from the "Schedule" fixed row onto the chosen resource.
  public scheduleWorkItem(): void {
    if (!this.scheduleTitle.trim()) {
      return;
    }

    this.myEvents = [
      ...this.myEvents,
      {
        id: `work-item-${Date.now()}`,
        resource: this.scheduleResource,
        start: new Date('2024-11-21T13:00:00.000Z'),
        end: new Date('2024-11-21T15:00:00.000Z'),
        title: this.scheduleTitle,
      },
    ];

    this.scheduleTitle = '';
  }

  public selectTab(tab: 'systems' | 'duts' | 'assets'): void {
    this.activeTab = tab;
  }

  // Returns the resource id(s) an event belongs to, regardless of whether
  // `resource` is a single id or an array of ids.
  private getResourceIds(event: MbscCalendarEvent): Array<string | number> {
    return Array.isArray(event.resource) ? event.resource : [event.resource as string | number];
  }

  // Finds the event through its resource + id and lets navigateToEvent bring the
  // resource row to the top of the scrollable area (below the fixed rows) while
  // also scrolling horizontally to the event's time range.
  //
  // navigateToEvent resolves the scroll target from the data model (id + start +
  // resource), so it works with virtual scroll even when the target row is
  // off-screen. We build a minimal explicit object and force `resource` to the
  // exact target id (rather than relying on whatever is stored on the event) so
  // it always scrolls to that row, even if the event spans multiple resources.
  public navigateToTarget(): void {
    const targetResourceId = this.targetEvent.resource as string;

    const eventForResource = this.myEvents.find((ev) =>
      this.getResourceIds(ev).includes(targetResourceId)
    );

    this.calendar.navigateToEvent({
      id: eventForResource?.id ?? this.targetEvent.id,
      start: eventForResource?.start ?? this.targetEvent.start,
      resource: targetResourceId,
    } as MbscCalendarEvent);
  }

  public onEventUpdated(event: MbscEventUpdatedEvent): void {
    this.showPopup = true;
    this.anchor = event.target!;
    this.currentEventId = event.event.id ?? 0;

    const original = this.myEvents.find((ev) => ev.id === event.event.id);
    this.previousStart = (original?.start as Date) ?? new Date();
    this.previousEnd = (original?.end as Date) ?? new Date();

    this.myEvents = this.myEvents.map((ev) => (ev.id === event.event.id ? event.event! : ev));
  }

  public onPopupClose(): void {
    this.showPopup = false;

    this.myEvents = this.myEvents.map((ev) => {
      if (ev.id === this.currentEventId) {
        return {
          ...ev,
          start: this.previousStart,
          end: this.previousEnd
        } as MbscCalendarEvent;
      }
      return ev;
    });
  }
}
