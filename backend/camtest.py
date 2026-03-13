import cv2

def find_working_cameras(max_tested=5):
    working = []

    for i in range(max_tested):
        cap = cv2.VideoCapture(i, cv2.CAP_AVFOUNDATION)

        if not cap.isOpened():
            print(i, "not opened")
            continue

        ret, frame = cap.read()

        if ret:
            print(i, "WORKING CAMERA")
            working.append(i)
        else:
            print(i, "opened but no frames")

        cap.release()

    return working


cams = find_working_cameras()
print("Working cameras:", cams)
