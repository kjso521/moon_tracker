[async]
Python은 기본적으로 한 줄의 코드가 완료되어야 다음 줄로 넘어가는 **synchronous(동기)** 방식으로 작동한다.
GPS 수신, Web API 요청, 파일 읽기/쓰기 등 응답 시간이 필요할 경우 synchronous 방식의 대기 시간이 길어지는 비효율이 있으므로,
async/await을 사용하여 **Asynchronous(비동기)** 방식으로 작동할 수 있도록 할 수 있다.

aync def를 통해 coroutine(비동기 함수)을 선언한다.
await을 사용하면 응답 요청 동안 coroutine 자체를 일시정지, 해당 함수 바깥으 다른 작업을 수행하게 된다.