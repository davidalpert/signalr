import * as signalR from '@microsoft/signalr';
import { Subject, from } from 'rxjs'
import { eachValueFrom } from 'rxjs-for-await';
import {MessagePackHubProtocol} from "@microsoft/signalr-protocol-msgpack";

// IMPORTANT: When a proxy (e.g. px) is in use, the server will get the request,
// but the client will not get the response
// So disable the proxy for this process.
process.env.http_proxy = "";

const builder: signalR.HubConnectionBuilder =
    new signalR.HubConnectionBuilder().configureLogging(signalR.LogLevel.Debug);

describe("smoke test", () => {
    it("should connect on a clients request for connection and answer a simple request",
        async () => {
            const connection: signalR.HubConnection = builder
                .withUrl("http://127.0.0.1:5001/hub")
                .build();
            await connection.start();
            const pong = await connection.invoke("ping");
            expect(pong).toEqual("Pong!");
            await connection.stop();
        });
});

describe("MessagePack smoke test", () => {
    it("should connect on a clients request for connection and answer a simple request",
        async () => {
            const connection: signalR.HubConnection = builder
                .withUrl("http://127.0.0.1:5001/hub")
                .withHubProtocol(new MessagePackHubProtocol())
                .build();
            await connection.start();
            const pong = await connection.invoke("ping");
            expect(pong).toEqual("Pong!");
            await connection.stop();
        });
});


class AlcoholicContent {
    drink: string
    strength: number
}

function runE2E(protocol: signalR.IHubProtocol) {
    let connection: signalR.HubConnection;
    beforeEach(async() => {
        connection = builder
            .withUrl("http://127.0.0.1:5001/hub")
            .withHubProtocol(protocol)
            .build();
        await connection.start();
    })
    afterEach(async() => {
        await connection.stop();
    })
    it("should answer a simple request", async () => {
        const pong = await connection.invoke("ping");
        expect(pong).toEqual("Pong!");
    })
    it("should answer a simple request with multiple results", async () => {
        const triple = await connection.invoke("triumphantTriple", "1.FC Bayern München");
        expect(triple).toEqual(["German Championship", "DFB Cup", "Champions League"]);
    })
    it("should answer a request with an resulting array of structs", async () => {
        const contents = await connection.invoke("alcoholicContents");
        expect(contents.length).toEqual(3);
        expect(contents[0].drink).toEqual('Brunello');
        expect(Math.abs(contents[2].strength- 56.2)).toBeLessThan(0.0001);
    })
    it("should answer a request with an resulting map", async () => {
        const contents = await connection.invoke("alcoholicContentMap");
        expect(contents["Beer"]).toEqual(4.9);
        expect(Math.abs(contents["Lagavulin Cask Strength"] - 56.2)).toBeLessThan(0.0001);
    })

    it("should receive a stream", async () => {
        const fiveDates: Subject<string> = new Subject<string>();
        connection.stream<string>("FiveDates").subscribe(fiveDates);
        let i = 0;
        let lastValue = '';
        for await (const value of eachValueFrom(fiveDates)) {
            expect(value).toBeDefined();
            expect(value).not.toEqual(lastValue);
            lastValue = value;
            i++;
        }
        expect(i).toEqual(5)
    })
    it("should upload a stream", async() =>{
        const receive = new Promise<number[]>(resolve => {
            connection.on("onUploadComplete", (r: number[]) => {
                resolve(r);
            });
        });
        await connection.send("uploadStream", from([2, 0, 7]));
        expect(await receive).toEqual([2, 0, 7])
    })
    it("should receive subsequent sends without await", async() => {
        let or: (value?: unknown) => void;
        const p = new Promise((r, rj) => {
            or = r;
        });
        let tc = 0
        connection.on("touched", () => {
            tc++;
            if (tc == 2) {
                or();
            }
        })
        connection.send("touch");
        connection.send("touch");
        await p;
    })
}

describe("JSON e2e test with microsoft/signalr client", () => {
    runE2E(new signalR.JsonHubProtocol());
})

describe("MessagePack e2e test with microsoft/signalr client", () => {
    runE2E(new MessagePackHubProtocol());
})
