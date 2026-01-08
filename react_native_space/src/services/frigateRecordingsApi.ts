import { frigateApi } from './frigateApi';

/**
 * Frigate Recordings API Service
 * 
 * Handles fetching recording segments and events for timeline scrubbing
 */

interface RecordingSegment {
  start_time: number;
  end_time: number;
  duration: number;
  events: number;
}

interface RecordingHour {
  segments: RecordingSegment[];
}

interface RecordingDay {
  day: string;
  hours: { [hour: string]: RecordingHour };
}

interface RecordingsResponse {
  [camera: string]: RecordingDay[];
}

interface Event {
  id: string;
  camera: string;
  label: string;
  start_time: number;
  end_time: number;
  thumbnail?: string;
  clip?: string;
  has_clip: boolean;
  box?: [number, number, number, number];
  top_score?: number;
}

class FrigateRecordingsApi {
  private cache: Map<string, { data: any; timestamp: number }> = new Map();
  private CACHE_TTL = 30 * 1000; // 30 seconds

  /**
   * Get recording segments for a camera
   */
  async getRecordingSegments(camera: string): Promise<RecordingDay[]> {
    const cacheKey = `recordings-${camera}`;
    const cached = this.cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.data;
    }

    try {
      const baseUrl = frigateApi.getBaseUrl();
      const token = frigateApi.getJWTToken();

      const response = await fetch(`${baseUrl}/api/${camera}/recordings`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch recordings: ${response.status}`);
      }

      const data: RecordingsResponse = await response.json();
      const segments = data[camera] || [];

      this.cache.set(cacheKey, { data: segments, timestamp: Date.now() });
      return segments;
    } catch (error) {
      console.error('[FrigateRecordings] Error fetching segments:', error);
      throw error;
    }
  }

  /**
   * Get recording URL for a specific time range
   * @param startTimestamp - Unix timestamp in SECONDS
   * @param endTimestamp - Unix timestamp in SECONDS
   */
  getRecordingUrl(
    camera: string,
    startTimestamp: number,
    endTimestamp: number
  ): string {
    const baseUrl = frigateApi.getBaseUrl();
    const token = frigateApi.getJWTToken();

    // Frigate recording endpoint requires /clip.mp4 suffix
    return `${baseUrl}/api/${camera}/start/${startTimestamp}/end/${endTimestamp}/clip.mp4?token=${token}`;
  }

  /**
   * Get events in a time range
   */
  async getEventsInRange(
    camera: string,
    afterTimestamp: number,
    beforeTimestamp: number,
    limit: number = 50
  ): Promise<Event[]> {
    const cacheKey = `events-${camera}-${afterTimestamp}-${beforeTimestamp}`;
    const cached = this.cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.data;
    }

    try {
      const baseUrl = frigateApi.getBaseUrl();
      const token = frigateApi.getJWTToken();

      // Convert milliseconds to seconds
      const after = Math.floor(afterTimestamp / 1000);
      const before = Math.floor(beforeTimestamp / 1000);

      const url = `${baseUrl}/api/events?camera=${camera}&after=${after}&before=${before}&limit=${limit}`;

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch events: ${response.status}`);
      }

      const events: Event[] = await response.json();

      this.cache.set(cacheKey, { data: events, timestamp: Date.now() });
      return events;
    } catch (error) {
      console.error('[FrigateRecordings] Error fetching events:', error);
      throw error;
    }
  }

  /**
   * Check if recordings exist for a time range
   */
  async hasRecordingsInRange(
    camera: string,
    startTimestamp: number,
    endTimestamp: number
  ): Promise<boolean> {
    try {
      const segments = await this.getRecordingSegments(camera);
      
      // Convert timestamps to seconds
      const start = startTimestamp / 1000;
      const end = endTimestamp / 1000;

      // Check if any segment overlaps with the requested range
      for (const day of segments) {
        for (const hour of Object.values(day.hours)) {
          for (const segment of hour.segments) {
            if (
              (segment.start_time <= end && segment.end_time >= start)
            ) {
              return true;
            }
          }
        }
      }

      return false;
    } catch (error) {
      console.error('[FrigateRecordings] Error checking recordings:', error);
      return false;
    }
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
  }
}

export const frigateRecordingsApi = new FrigateRecordingsApi();
