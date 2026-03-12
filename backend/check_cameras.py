import cv2

def open_camera():
    camera = cv2.VideoCapture(0, cv2.CAP_AVFOUNDATION)

    if not camera.isOpened():
        print("Camera 0 failed to open.")
        return

    print("Camera 0 opened successfully.")

    while True:
        ret, frame = camera.read()
        if not ret:
            print("Failed to read frame.")
            break

        cv2.imshow("Camera 0", frame)

        # press q to exit
        if cv2.waitKey(1) & 0xFF == ord('q'):
            break

    camera.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    open_camera()