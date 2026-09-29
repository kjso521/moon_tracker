import ephem
import math
from datetime import datetime, timezone

class MoonEngine:
    "입력 : Location, Time -> 출력 : 달의 방위각(Azimuth)과 고도(Altitude)"

    def get_moon_position(self, lat: float, lon: float, date_time: datetime = None):
        """
        Inputs:
        - lat (float) : latitude  (위도) (ex: 37.5665)
        - lon (float) : longitude (경도) (ex: 126.9780))
        - date_time (datetime): target time (Current time if None. Timezone aware is recommended)

        Outputs:
            dict: {
                "azimuth"  : float (0~360 degress, Clockwise from North),
                "altitude" : float (±90 degrees, Altitude above the horizon),
                "phase"    : float (0~100%, Phase of the Moon)
            }
        """
        # 1. Set up the Observer
        observer = ephem.Observer()
        observer.lat, observer.lon = str(lat), str(lon)
        # ephem can handle both string and float.
        # can handle minutes, seconds and decimal degrees when string is used.

        # 2. Set target time (UTC conversion is necessary for ephem)
        if date_time is None:
            date_time = datetime.now(timezone.utc)
        else:
            if date_time.tzinfo is None:
                date_time = date_time.astimezone(timezone.utc)
            else:
                date_time = date_time.astimezone(timezone.utc)
        
        observer.date = date_time

        # 3. Create Moon object and Compute its position
        moon = ephem.Moon()
        moon.compute(observer)

        # 4. Return the results
        az_deg  = math.degrees(moon.az)
        alt_deg = math.degrees(moon.alt)

        return {
            "azimuth"  : round(az_deg,  2),
            "altitude" : round(alt_deg, 2),
            "phase"    : round(moon.phase, 1) # How much of the Moon's surface is illuminated (0: New Moon, 100: Full Moon)
        }