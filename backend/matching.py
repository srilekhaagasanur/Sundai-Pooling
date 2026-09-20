from datetime import datetime


def get_time_difference(time1, time2):

    format = "%H:%M"

    t1 = datetime.strptime(time1, format)
    t2 = datetime.strptime(time2, format)

    difference = abs((t1 - t2).total_seconds())

    minutes = difference / 60

    return minutes

def is_time_match(time1, time2):

    difference = get_time_difference(
        time1,
        time2
    )

    return difference <= 30
