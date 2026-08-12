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
import { Component, OnInit, ViewChild, NgZone } from '@angular/core';

// --- App-level abstraction, mirroring SlCalendarEvent from systemlink-calendar-lib ---
// This is the shape app-level code (e.g. the toolbar click handler) works with.
// It intentionally uses `resources` (plural array) instead of Mobiscroll's native
// `resource` field, so it must be converted before being handed to Mobiscroll.
interface SlCalendarEvent {
  id: string | number;
  header?: string;
  start?: Date;
  end?: Date;
  resources?: Array<string | number>;
  color?: string;
  canEdit?: boolean;
  canDelete?: boolean;
  cssClass?: string;
}

// --- Adapter, mirroring MobiscrollDataAdapter.convertToMbscEventData() ---
// Converts the app-level SlCalendarEvent shape into Mobiscroll's native
// MbscCalendarEvent shape. This is the layer the real app's sl-event-calendar
// wrapper provides and the test app was previously missing, which is why
// `resources: [...]` was silently ignored by raw Mobiscroll.
class MobiscrollDataAdapter {
  public convertToMbscEventData(event: SlCalendarEvent): MbscCalendarEvent {
    const allowEdit = event.canEdit ?? false;
    const allowDelete = event.canDelete ?? false;
    const { resources, ...eventDataWithoutResources } = event;

    return {
      ...eventDataWithoutResources,
      resource: resources,          // resources[] -> native `resource` (array or single id)
      title: event.header,          // header -> title
      dragBetweenResources: allowEdit,
      dragInTime: allowEdit,
      resize: allowEdit,
      editable: allowEdit || allowDelete,
    } as MbscCalendarEvent;
  }
}

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent {
  // Reference to the eventcalendar instance so we can call navigateToEvent().
  @ViewChild('inst', { static: false }) calendar!: MbscEventcalendar;

  private readonly mobiscrollDataAdapter = new MobiscrollDataAdapter();

  // Incremented on every navigateToEvent() call. Used to invalidate any
  // in-flight, previously-scheduled navigation/correction from an earlier
  // click, so overlapping async chains can't race each other and stomp on
  // the same scrollTop.

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

  // The event used to demonstrate navigateToEvent on DUT 3.
  // These feed `[data]` directly on the native <mbsc-eventcalendar>, so they stay
  // in native Mobiscroll shape (singular `resource`) - only the app-level
  // navigateToEvent() call path goes through the SlCalendarEvent -> adapter conversion.
  public targetEvent: MbscCalendarEvent = {
    id: 'target-event-dut',
    resource: 'dut-1103',
    start: new Date('2024-11-21T09:00:00.000Z'),
    end: new Date('2024-11-21T11:00:00.000Z'),
    title: 'DUT 1103 Event',
    color: '#e53935',
  };

  // Asset event for demonstration on the Assets tab.
  public assetEvent: MbscCalendarEvent = {
    id: 'target-event-asset',
    resource: 'asset-400',
    start: new Date('2024-11-21T14:00:00.000Z'),
    end: new Date('2024-11-21T16:00:00.000Z'),
    title: 'Asset 400 Event',
    color: '#1976d2',
  };

  // DUT 6 event for demonstration.
  public dutSixEvent: MbscCalendarEvent = {
    id: 'target-event-dut6',
    resource: 'dut-6',
    start: new Date('2024-11-21T10:00:00.000Z'),
    end: new Date('2024-11-21T12:00:00.000Z'),
    title: 'DUT 6 Event',
    color: '#388e3c',
  };

  // Fixture event for demonstration on the Systems tab.
  public fixtureEvent: MbscCalendarEvent = {
    id: 'target-event-fixture',
    resource: 'sys-5-fix-1',
    start: new Date('2024-11-21T15:00:00.000Z'),
    end: new Date('2024-11-21T17:00:00.000Z'),
    title: 'System 5 Fixture 1 Event',
    color: '#7b1fa2',
  };

  // Shared event that appears on both DUT 3 and Asset 4.
  public sharedEvent: MbscCalendarEvent = {
    id: 'target-event-shared',
    resource: ['dut-3', 'asset-4'],
    start: new Date('2024-11-21T11:00:00.000Z'),
    end: new Date('2024-11-21T13:00:00.000Z'),
    title: 'Shared Event',
    color: '#f57c00',
  };

  // Overlapping event on DUT 1103 to test variable row heights
  // This runs at the same time as targetEvent, forcing row expansion
  public overlappingEvent: MbscCalendarEvent = {
    id: 'overlapping-event-dut1103',
    resource: 'dut-1103',
    start: new Date('2024-11-21T09:30:00.000Z'),
    end: new Date('2024-11-21T11:30:00.000Z'),
    title: 'Overlapping Event (Variable Height)',
    color: '#ff6f00',
  };

  // DUT 1189 event for testing variable row heights
  public dut1189Event: MbscCalendarEvent = {
    id: 'dut-1189-event',
    resource: 'dut-1189',
    start: new Date('2024-11-21T08:00:00.000Z'),
    end: new Date('2024-11-21T10:00:00.000Z'),
    title: 'DUT 1189 Event',
    color: '#c2185b',
  };

  // Asset 944 event for testing variable row heights
  public asset944Event: MbscCalendarEvent = {
    id: 'asset-944-event',
    resource: 'asset-944',
    start: new Date('2024-11-21T12:00:00.000Z'),
    end: new Date('2024-11-21T14:00:00.000Z'),
    title: 'Asset 944 Event',
    color: '#0097a7',
  };

  // First overlapping event on Asset 700 (to force row expansion)
  public asset700Event1: MbscCalendarEvent = {
    id: 'asset-700-event-1',
    resource: 'asset-700',
    start: new Date('2024-11-21T13:00:00.000Z'),
    end: new Date('2024-11-21T15:00:00.000Z'),
    title: 'Asset 700 Event 1',
    color: '#6a1b9a',
  };

  // Second overlapping event on Asset 700 (overlaps with first to force row expansion)
  public asset700Event2: MbscCalendarEvent = {
    id: 'asset-700-event-2',
    resource: 'asset-700',
    start: new Date('2024-11-21T13:30:00.000Z'),
    end: new Date('2024-11-21T15:30:00.000Z'),
    title: 'Asset 700 Event 2',
    color: '#00838f',
  };

  public showPopup = false;
  public anchor: HTMLElement = document.createElement('div');

  private currentEventId: string | number = 0;
  private previousStart = new Date();
  private previousEnd = new Date();

  // Filtered resources based on active tab. The 3 fixed rows are always shown;
  // scrollable resources are filtered to match the active tab category.
  // NOTE: this is a plain property, not a getter. A getter would return a new
  // array reference on every Angular change-detection cycle (not just on tab
  // switch), which made Mobiscroll treat the resources input as constantly
  // changing and destabilized _resourceTops. It's only recomputed explicitly
  // in selectTab().
  public filteredResources: MbscResource[] = [];

  public constructor(private ngZone: NgZone) {
    this.myResources = this.buildResources();
    this.myEvents = this.buildEvents();
    this.filteredResources = this.computeFilteredResources(); // initial value
  }

  private buildResources(): MbscResource[] {
    const resources: MbscResource[] = [
      // 3 fixed rows - pinned at the top, inside the same scroll container as
      // the rest of the resources (MbscResource.fixed = true). Because they are
      // part of the same virtualized resource list, Mobiscroll's own scrolling
      // (including navigateToEvent) automatically keeps them out of the way -
      // scrollable rows land just below them instead of being hidden behind.
      { id: 'fixed-schedule', fixed: true, name: 'Schedule', minHeight: 60, eventCreation: false, cssClass: 'fixed-resource-row' },
      { id: 'fixed-toolbar', fixed: true, name: 'Toolbar', minHeight: 350, eventCreation: false, cssClass: 'fixed-resource-row' },
      { id: 'fixed-tabs', fixed: true, name: 'Tabs', minHeight: 120, eventCreation: false, cssClass: 'fixed-resource-row' },
    ];

    // Systems, each with nested fixtures.
    for (let s = 1; s <= 5; s++) {
      resources.push({
        id: `sys-${s}`,
        name: `System ${s}`,
        children: [
          { id: `sys-${s}-fix-1`, name: `Fixture ${s}.1` },
          { id: `sys-${s}-fix-2`, name: `Fixture ${s}.2` },
          { id: `sys-${s}-fix-3`, name: `Fixture ${s}.3` },
        ],
      });
    }

    // DUTs.
    for (let d = 1; d <= 1200; d++) {
      resources.push({ id: `dut-${d}`, name: `DUT ${d}` });
    }

    // Assets.
    for (let a = 1; a <= 1200; a++) {
      resources.push({ id: `asset-${a}`, name: `Asset ${a}` });
    }

    return resources;
  }

  private buildEvents(): MbscCalendarEvent[] {
    const dayStart = new Date('2024-11-21T00:00:00.000Z');
    const dayEnd = new Date('2024-11-22T00:00:00.000Z');

    // Fixed rows now render via resourceTemplate, no placeholder events needed
    return [
      this.targetEvent,
  this.overlappingEvent,  // This overlaps with targetEvent, forcing variable row height
  this.dut1189Event,
  this.asset944Event,
  this.asset700Event1,
  this.asset700Event2,  // This overlaps with asset700Event1, forcing variable row height
  this.assetEvent,
  this.dutSixEvent,
  this.fixtureEvent,
  this.sharedEvent,
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
  // Simulate production's combineLatest behavior: multiple independent
  // resource-array rebuilds firing in quick succession around the tab click,
  // each one a full deep-rebuild (not a cheap filter).
  this.filteredResources = this.deepRebuildFilteredResources();
  setTimeout(() => { this.filteredResources = this.deepRebuildFilteredResources(); }, 30);
  setTimeout(() => { this.filteredResources = this.deepRebuildFilteredResources(); }, 90);
}

private deepRebuildFilteredResources(): MbscResource[] {
  const fixedRows = this.myResources.slice(0, 3);
  const scrollableResources = this.myResources.slice(3).filter(r => {
    if (this.activeTab === 'systems') return r.id.toString().startsWith('sys-');
    if (this.activeTab === 'duts') return r.id.toString().startsWith('dut-');
    if (this.activeTab === 'assets') return r.id.toString().startsWith('asset-');
    return true;
  });
  // Deep-clone every resource and its children, mirroring convertToMbscResourceData's cost.
  const deepClone = (r: MbscResource): MbscResource => ({
    ...r,
    children: r.children?.map(deepClone),
  });
  return [...fixedRows, ...scrollableResources].map(deepClone);
}

  // Returns the resource id(s) an event belongs to, regardless of whether
  // `resource` is a single id or an array of ids.
  private getResourceIds(event: MbscCalendarEvent): Array<string | number> {
    return Array.isArray(event.resource) ? event.resource : [event.resource as string | number];
  }

  private computeFilteredResources(): MbscResource[] {
    const fixedRows = this.myResources.slice(0, 3);
    const scrollableResources = this.myResources.slice(3);
    const filtered = scrollableResources.filter((r) => {
      if (this.activeTab === 'systems') return r.id.toString().startsWith('sys-');
      if (this.activeTab === 'duts') return r.id.toString().startsWith('dut-');
      if (this.activeTab === 'assets') return r.id.toString().startsWith('asset-');
      return true;
    });
    return [...fixedRows, ...filtered];
  }

  // Generic method to navigate to any event, with tab switching if needed.
  // Pass the event and an optional targetResourceId to override the event's resource.
  // If the target resource is not in the current tab, automatically switches tabs.
  //
  // Each call gets its own navigation attempt. Any previously-scheduled navigation
  // or scroll-correction that hasn't run yet becomes superseded and
  // is skipped - this prevents two overlapping async chains from racing each
  // other and producing nondeterministic scroll results.
  public navigateToEvent(
    event: MbscCalendarEvent,
    targetResourceId?: string | number
  ): void {
    const resourceId = targetResourceId ?? (event.resource as string);
    const requiredTab = this.getTabForResource(resourceId);

    if (requiredTab && this.activeTab !== requiredTab) {
      this.selectTab(requiredTab);
      // Single deferred attempt (not two racing ones) - gives Angular CD +
      // Mobiscroll's own onDataChange time to rebuild _resourceTops for the
      // newly-activated tab's resources before we read from it.
      setTimeout(() => {
        this.performNavigation(event, resourceId);
      }, 0);
    } else {
      this.performNavigation(event, resourceId);
    }
  }

  // Determine which tab a resource belongs to.
  private getTabForResource(resourceId: string | number): 'systems' | 'duts' | 'assets' | null {
    const id = resourceId.toString();
    if (id.startsWith('sys-')) return 'systems';
    if (id.startsWith('dut-')) return 'duts';
    if (id.startsWith('asset-')) return 'assets';
    return null;
  }

  // Deprecated: use navigateToEvent() directly instead.
  public navigateToTarget(): void {
    this.navigateToEvent(this.targetEvent);
  }

  // Deprecated: use navigateToEvent() directly instead.
  public navigateToAsset(): void {
    this.navigateToEvent(this.assetEvent);
  }

  // Deprecated: use navigateToEvent() directly instead.
  public navigateToDutSix(): void {
    this.navigateToEvent(this.dutSixEvent);
  }

  // Deprecated: use navigateToEvent() directly instead.
  public navigateToSharedDut(): void {
    const sharedOnDut = { ...this.sharedEvent, resource: 'dut-3' } as MbscCalendarEvent;
    this.navigateToEvent(sharedOnDut, 'dut-3');
  }

  // Deprecated: use navigateToEvent() directly instead.
  public navigateToSharedAsset(): void {
    const sharedOnAsset = { ...this.sharedEvent, resource: 'asset-4' } as MbscCalendarEvent;
    this.navigateToEvent(sharedOnAsset, 'asset-4');
  }

  // Navigate to DUT 1189 Event
  public navigateToDut1189(): void {
    this.navigateToEvent(this.dut1189Event);
  }

  // Navigate to Asset 944 Event
  public navigateToAsset944(): void {
    this.navigateToEvent(this.asset944Event);
  }

  // Navigate to Asset 700 Event 1
  public navigateToAsset700Event1(): void {
    this.navigateToEvent(this.asset700Event1);
  }

  // Navigate to Asset 700 Event 2
  public navigateToAsset700Event2(): void {
    this.navigateToEvent(this.asset700Event2);
  }

  // Helper method to perform the actual navigation to an event.
  // Finds the real event (if one exists) for the target resource, then builds the
  // app-level SlCalendarEvent shape (id, start, resources: [single id]) - matching
  // exactly what scheduling-assistant-timeline-view.component.ts builds in the
  // real app - and hands it to navigateToEventViaAdapter() for conversion + the
  // actual native Mobiscroll call.
  private performNavigation(event: MbscCalendarEvent, targetResourceId: string | number): void {
    const resourceId = targetResourceId;

    const eventForResource = this.myEvents.find((ev) =>
      this.getResourceIds(ev).includes(resourceId)
    );

    const slEvent: SlCalendarEvent = {
      id: eventForResource?.id ?? event.id ?? resourceId,
      start: eventForResource?.start as Date ?? event.start as Date,
      resources: [resourceId], // single-element array — always just the target resource id
    };

    this.navigateToEventViaAdapter(slEvent);
  }

  // Mirrors SlEventCalendarComponent.navigateToEvent() in sl-event-calendar.component.ts:
  // adapts the app-level SlCalendarEvent to native Mobiscroll shape, calls the real
  // navigateToEvent(), then corrects for the fixed rows overlapping the target row.
  private lastClickTime = 0;

private navigateToEventViaAdapter(event: SlCalendarEvent): void {
  const now = performance.now();
  const gapSinceLastClick = now - this.lastClickTime;
  this.lastClickTime = now;

  const mbscEvent = this.mobiscrollDataAdapter.convertToMbscEventData(event);
  const el = (this.calendar as any).nativeElement as HTMLElement;
  const scrollCont = el.querySelector<HTMLElement>('.mbsc-timeline-grid-scroll');

  console.log('BEFORE navigateToEvent', {
    gapSinceLastClickMs: gapSinceLastClick.toFixed(1),
    scrollTopBefore: scrollCont?.scrollTop,
    target: mbscEvent.resource,
  });

  this.calendar.navigateToEvent(mbscEvent);

  console.log('AFTER navigateToEvent (sync)', {
    scrollTopAfterSync: scrollCont?.scrollTop,
  });

  requestAnimationFrame(() => {
    console.log('AFTER 1 rAF', { scrollTop: scrollCont?.scrollTop });
  });
  setTimeout(() => {
    console.log('AFTER 300ms', { scrollTop: scrollCont?.scrollTop });
  }, 300);

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